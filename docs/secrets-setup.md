# Where to get every key (team setup)

Do **not** commit real values. Put them in the gitignored root `.env` (server) and `mobile/.env` (phone only). Share with teammates by AirDrop or a private message, never in git.

Live ML API (already running): `https://ml-production-04c0.up.railway.app`  
Health check: `https://ml-production-04c0.up.railway.app/health` → expect `{"ok":true,"db":true}`

Project ref: `mwfzgkikbmnghueolfnw`  
Supabase dashboard: https://supabase.com/dashboard/project/mwfzgkikbmnghueolfnw

---

## 1. One-time: copy the example files

From the repo root:

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

Open with `open -e .env` (and `open -e mobile/.env`). One `KEY=value` per line. No comments after the value.

---

## 2. Supabase (most of the server keys)

Adam owns this project. Invite Alan / Arjun from **Organization / Project → Team** if they need the dashboard.

### `SUPABASE_URL`

Fixed for this project:

```text
https://mwfzgkikbmnghueolfnw.supabase.co
```

Same value goes in `mobile/.env` as `EXPO_PUBLIC_SUPABASE_URL`.

### `SUPABASE_ANON_KEY` (publishable)

1. Open https://supabase.com/dashboard/project/mwfzgkikbmnghueolfnw/settings/api-keys  
2. Copy the **anon** / **public** key.  
3. Put it in root `.env` as `SUPABASE_ANON_KEY`.  
4. Put the **same** value in `mobile/.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

Safe to ship inside the app. Still don’t paste it into random public chats if you can avoid it.

### `SUPABASE_SERVICE_KEY` (secret — server only)

1. Same API keys page.  
2. Copy the **service_role** key (sometimes labeled “secret”).  
3. Root `.env` only as `SUPABASE_SERVICE_KEY`.  
4. **Never** put this in `mobile/` or `dashboard/`. It bypasses RLS and can delete everyone’s data.

### `DATABASE_URL` (secret — server only)

1. Project home → **Connect**.  
2. Choose **Session pooler** (not “Direct”). Port must be **5432**.  
3. Copy the URI. It looks like:  
   `postgresql://postgres.mwfzgkikbmnghueolfnw:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`  
4. If you don’t know the password: **Project Settings → Database → Reset database password**, save the new password, then paste it into the URI where it says `[YOUR-PASSWORD]`.  
5. After a password reset, update Railway’s `DATABASE_URL` too (Adam), or the live API will lose the DB until you do.

### `SUPABASE_JWT_SECRET`

Leave **empty** for this project. We use JWKS (ES256). Filling this field makes the ML service try HS256 and reject every login.

---

## 3. Anthropic

### `ANTHROPIC_API_KEY`

1. https://console.anthropic.com → API keys → Create.  
2. Copy once into root `.env`.  
3. Powers interest extraction, icebreakers, follow-ups, feed summaries, reply drafts, and the assistant. Without it those features fall back to short templates (or `503` for the assistant).

---

## 4. GitHub OAuth (Connect GitHub in the app)

Alan already created the OAuth app. Values live on his laptop.

### `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

1. https://github.com/settings/developers → **OAuth Apps** → the Formal Connection app.  
2. Copy **Client ID**.  
3. **Client secret**: shown only when created. If lost or leaked in chat, generate a **new** secret and invalidate the old one.  
4. **Authorization callback URL** must include:  
   `https://ml-production-04c0.up.railway.app/connect/github/callback`  
   (You can keep old trycloudflare URLs for a while; delete them when the laptop tunnel is retired.)  
5. AirDrop `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` to Adam. He sets them on Railway. Do not commit them.

Homepage URL can be `https://ml-production-04c0.up.railway.app`.

---

## 5. Random signing keys (you generate these)

Generate once and keep them:

```bash
openssl rand -hex 32
```

Run that twice:

| Key | Where it goes | Notes |
| --- | --- | --- |
| `TOKEN_ENCRYPTION_KEY` | root `.env` + Railway | Encrypts stored GitHub tokens. **Do not rotate** after people have connected GitHub, or those tokens become unreadable. |
| `QR_SIGNING_KEY` | root `.env` + Railway | Signs verification QR payloads. |

---

## 6. Railway (live ML server)

Project name: **formal-connection** · Service: **ml**  
Public URL: `https://ml-production-04c0.up.railway.app`

Adam is logged in. Alan does **not** need a Railway account for the demo.

### Variables the `ml` service must have

Set in the Railway dashboard (**Variables**) or:

```bash
cd ml
npx @railway/cli variable set NAME --stdin
# paste value, Enter, Ctrl-D
```

Required:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY` (optional for some paths; fine to set)
- `SUPABASE_JWT_SECRET` → leave unset / empty
- `ANTHROPIC_API_KEY`
- `QR_SIGNING_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `ML_API_URL=https://ml-production-04c0.up.railway.app`

### Redeploy after `ml/` code changes

```bash
cd ml
npx @railway/cli up --detach --path-as-root .
```

### Domain / port

Networking domain should target the port in the logs (`Uvicorn running on 0.0.0.0:$PORT`). This deploy uses **8080**. `/health` should return `ok` and `db: true`.

---

## 7. Phone app (`mobile/.env` only)

```bash
EXPO_PUBLIC_SUPABASE_URL=https://mwfzgkikbmnghueolfnw.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
EXPO_PUBLIC_API_BASE_URL=https://ml-production-04c0.up.railway.app
EXPO_PUBLIC_USE_MOCKS=0
```

Then from the repo:

```bash
./scripts/start-app.sh
# or, on campus Wi‑Fi that blocks LAN:
cd mobile && npx expo start --go --tunnel --clear
```

Scan the QR / `exp://…` URL Expo prints. Same Wi‑Fi is required for `--lan`; tunnel works across networks.

---

## 8. Who does what (right now)

| Person | Action |
| --- | --- |
| **Alan** | Add Railway callback on the GitHub OAuth app. AirDrop `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` to Adam. |
| **Adam** | Paste those three into Railway `ml` variables. Redeploy if asked (`cd ml && npx @railway/cli up --detach --path-as-root .`). |
| **Arjun** | Needs dashboard/SQL? Ask Adam for a Supabase Team invite. For a local ML run, AirDrop a filled root `.env` — don’t pull secrets from git. |
| **Everyone** | `git fetch origin && git reset --hard origin/main` on a clean tree after the history rewrite. Use only the `hackgt13-project` folder. |

---

## 9. Optional / not needed for the core demo

| Key | Notes |
| --- | --- |
| `LINKEDIN_CLIENT_ID` | Configured inside **Supabase Auth → Providers**, not usually in our `.env`. Enable LinkedIn OIDC in the dashboard if you want LinkedIn sign-in. |
| `INVITE_BASE_URL` | Dashboard invite page URL when invites go live. |
| `CORS_ORIGINS` | Comma-separated dashboard origins if the browser dashboard calls the API. |
| `FACEBOOK_*` / `TIKTOK_*` | Unused for the demo path. |
| `EXPO_ACCESS_TOKEN` | Only if Expo push security requires it. |

---

## 10. Sanity checks

```bash
# API up + DB connected
curl -s https://ml-production-04c0.up.railway.app/health

# Local file present and ignored
test -f .env && git check-ignore -v .env
```

If `/health` shows `"db":false`, fix `DATABASE_URL` (password / session pooler / port 5432) and update Railway.
