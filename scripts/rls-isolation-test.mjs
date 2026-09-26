// RLS isolation test: proves user A's session cannot read user B's owner-only rows.
// Creates two throwaway users, seeds rows for B with the service key, reads them as A and as B,
// then deletes both users (rows cascade).
//
// Usage (from repo root, no dependencies):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
//     node scripts/rls-isolation-test.mjs

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_KEY: service } = process.env;
if (!url || !anon || !service) {
  console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY.");
  process.exit(2);
}

async function call(path, { key, token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return data;
}

const stamp = Date.now();
const password = `Rls-test-${stamp}-${Math.random().toString(36).slice(2)}`;

async function makeUser(label) {
  const email = `rls-${label}-${stamp}@example.com`;
  const user = await call("/auth/v1/admin/users", {
    key: service, method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { name: `RLS ${label}` } },
  });
  const session = await call("/auth/v1/token?grant_type=password", {
    key: anon, method: "POST", body: { email, password },
  });
  return { id: user.id, token: session.access_token };
}

const insert = (table, row) =>
  call(`/rest/v1/${table}`, { key: service, method: "POST", body: row, headers: { Prefer: "return=minimal" } });

const readAs = (who, table, filter) =>
  call(`/rest/v1/${table}?select=*&${filter}`, { key: anon, token: who.token });

let a, b, failures = 0;
try {
  a = await makeUser("a");
  b = await makeUser("b");

  const profiles = await readAs(a, "profiles", `id=eq.${a.id}`);
  const trigger = profiles.length === 1 && profiles[0].name === "RLS a";
  console.log(`${trigger ? "PASS" : "FAIL"}  signup trigger created A's profile`);
  if (!trigger) failures++;

  const expires = new Date(Date.now() + 86400e3).toISOString();
  const seeds = [
    ["notifications", { user_id: b.id, kind: "suggestion", payload: {} }, "user_id"],
    ["invites", { sender_id: b.id, token_hash: `rls-${stamp}`, channel: "link", expires_at: expires }, "sender_id"],
    ["feed_items", { author_id: b.id, kind: "post", title: "rls test" }, "author_id"],
    ["web_mentions", { user_id: b.id, url: "https://example.com" }, "user_id"],
    ["feed_prefs", { user_id: b.id }, "user_id"],
    ["event_registrations", { event_id: 1, user_id: b.id }, "user_id"],
    ["presence", { user_id: b.id, building_id: "test", expires_at: expires }, "user_id"],
    ["user_skill_profiles", { user_id: b.id, version: 1, is_active: true, trigger_source: "rebuild", input_hash: `h${stamp}`, profile: {}, skills: [] }, "user_id"],
    ["resumes", { user_id: b.id, storage_path: `${b.id}/x.pdf`, filename: "x.pdf", mime_type: "application/pdf", size_bytes: 10 }, "user_id"],
  ];

  for (const [table, row, col] of seeds) {
    await insert(table, row);
    const asA = await readAs(a, table, `${col}=eq.${b.id}`);
    const asB = await readAs(b, table, `${col}=eq.${b.id}`);
    // presence has no client policies at all, so B can't read it either.
    const ownerShouldSee = table !== "presence";
    const ok = asA.length === 0 && (asB.length > 0) === ownerShouldSee;
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${table}: A sees ${asA.length}, B sees ${asB.length}`);
  }

  await call(`/storage/v1/object/resumes/${b.id}/resume.pdf`, {
    key: service, method: "POST", body: "%PDF-1.4 rls test", headers: { "Content-Type": "application/pdf" },
  });
  const listAs = (who) =>
    call("/storage/v1/object/list/resumes", { key: anon, token: who.token, method: "POST", body: { prefix: `${b.id}/` } });
  const [filesA, filesB] = [await listAs(a), await listAs(b)];
  const storageOk = filesA.length === 0 && filesB.length === 1;
  if (!storageOk) failures++;
  console.log(`${storageOk ? "PASS" : "FAIL"}  resumes bucket: A sees ${filesA.length}, B sees ${filesB.length}`);
  await call("/storage/v1/object/resumes", { key: service, method: "DELETE", body: { prefixes: [`${b.id}/resume.pdf`] } });
} catch (err) {
  failures++;
  console.error("ERROR", err.message);
} finally {
  for (const u of [a, b]) {
    if (u) await call(`/auth/v1/admin/users/${u.id}`, { key: service, method: "DELETE" }).catch(() => {});
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll RLS isolation checks passed");
process.exit(failures ? 1 : 0);
