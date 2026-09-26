import { enforceGraphPrivacy } from "./privacy";
import { isGraphPayload, type GraphMode, type GraphPayload } from "./types";

const API = process.env.NEXT_PUBLIC_ML_API_URL?.replace(/\/$/, "") ?? "";

/**
 * Live /graph when we have an API URL and a token; otherwise the committed mocks
 * (docs/mocks, copied to public/mocks by `npm run sync-mocks`).
 */
export async function fetchGraph(opts: {
  mode: GraphMode;
  eventId: number;
  token: string | null;
  signal?: AbortSignal;
}): Promise<{ data: GraphPayload; source: "live" | "mock" }> {
  const live = Boolean(API && opts.token);
  const url = live
    ? `${API}/graph?event_id=${opts.eventId}&mode=${opts.mode}`
    : `/mocks/graph_${opts.mode}.json`;
  const res = await fetch(url, {
    headers: live ? { Authorization: `Bearer ${opts.token}` } : undefined,
    signal: opts.signal,
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!isGraphPayload(body)) throw new Error("Unexpected /graph response");
  return { data: enforceGraphPrivacy(body), source: live ? "live" : "mock" };
}
