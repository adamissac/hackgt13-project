# Put the ML service online (Railway)

One permanent URL for the ML API so phones and the dashboard stop depending on tunnel scripts.
Railway gives trial credit; the Hobby plan is about **$5/month** after that. (Render’s free tier is too small for the embedding model.)

1. Open https://railway.com → **Login** → **Login with GitHub** → allow access to **adamissac/hackgt13-project**.
2. **New Project** → **Deploy from GitHub repo** → choose **hackgt13-project**.
3. Click the new service → **Settings** → **Root Directory**: set to `ml` (not the repo root).
4. **Variables** → **Raw Editor**. On your Mac, open `~/hackgt-project/.env`, copy all lines, paste here, **Update Variables**.
   The server needs these names (paste your real values; do not commit them): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET` (empty if JWKS), `QR_SIGNING_KEY`, `TOKEN_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
   Optional: `CORS_ORIGINS`, `ML_API_URL`, `INVITE_BASE_URL`, `APP_GITHUB_REDIRECT`, `MATCH_MODEL`, `QUIET_HOURS`, `DASHBOARD_REQUIRE_AUTH`, `EXPO_ACCESS_TOKEN`.
   Skip `EXPO_PUBLIC_*` lines (those belong in `mobile/.env` only).
5. **Deploy** (or wait for the first deploy). First build can take ~5–10 minutes (downloads the embedding model).
6. **Settings** → **Networking** → **Generate Domain**. Point it at the port in the deploy logs (`Uvicorn running on http://0.0.0.0:$PORT`). Railway sets `PORT` (this service uses **8080**). Do not point the domain at 8000 unless the log says 8000.
7. In a browser open `https://<your-domain>/health`. Expect JSON like `{"ok":true,"db":true}` once `DATABASE_URL` is correct (`db:false` still means the app is up). Live service: `https://ml-production-04c0.up.railway.app/health`.
8. On your Mac, in the repo folder, set the app once: edit `mobile/.env` (copy from `mobile/.env.example` if needed) and set `EXPO_PUBLIC_API_BASE_URL=https://<your-domain>` and `EXPO_PUBLIC_USE_MOCKS=0`. Tell teammates to do the same. Restart Expo: `cd mobile && npx expo start --go --tunnel --clear`.
9. After deploy, set **Variables** `ML_API_URL` to the same Railway URL (GitHub OAuth callback). Set GitHub OAuth app callback to `https://<your-domain>/connect/github/callback`.

This service was uploaded from `ml/` (`npx @railway/cli up --detach --path-as-root .`). It keeps running after the Mac is off. GitHub auto-deploy is not connected yet: the repo root is not the Docker context, so a GitHub source must use root directory `ml` or the next build will not find the Dockerfile. Until then, redeploy from `ml/` with that same `up` command. Logs: service → **Deployments** → **View logs**.

**Where every key comes from (click-by-click):** see [`docs/secrets-setup.md`](secrets-setup.md).
