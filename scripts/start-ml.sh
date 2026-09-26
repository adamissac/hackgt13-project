#!/usr/bin/env bash
# Start the ML service and a public cloudflared tunnel for phones. Ctrl+C stops both.
# Usage (from repo root): ./scripts/start-ml.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT/ml"

[ -f "$ROOT/.env" ] || { echo "Missing $ROOT/.env (copy .env.example and fill it in)."; exit 1; }
if [ ! -d .venv ]; then
  if command -v uv >/dev/null; then uv venv -q -p 3.12 .venv && . .venv/bin/activate && uv pip install -q -r requirements.txt
  else python3 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt; fi
fi
. .venv/bin/activate

CF="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
[ -x "$CF" ] || { echo "Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; exit 1; }

uvicorn app.main:app --host 0.0.0.0 --port 8000 &
API=$!
trap 'kill $API $TUN 2>/dev/null' EXIT INT TERM

"$CF" tunnel --no-autoupdate --url http://localhost:8000 2>&1 | tee /tmp/fc-tunnel.log | grep --line-buffered -o 'https://[a-z0-9-]*\.trycloudflare\.com' | while read -r url; do
  echo; echo "==> ML_API_URL for phones: $url"
  if python3 "$ROOT/scripts/set-mobile-api-url.py" "$url" "$ROOT/mobile/.env"; then
    echo "Updated mobile/.env. Restart Expo: cd mobile && npx expo start --go --tunnel --clear"
  else
    echo "Could not update mobile/.env; set EXPO_PUBLIC_API_BASE_URL=$url and EXPO_PUBLIC_USE_MOCKS=0 by hand"
  fi
  echo
done &
TUN=$!
wait $API
