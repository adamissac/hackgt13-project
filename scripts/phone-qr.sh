#!/usr/bin/env bash
# Start the current app on THIS laptop and make a QR for THIS phone.
# Campus Wi-Fi blocks LAN addresses, so this uses an Expo tunnel.
# Usage, from anywhere: /path/to/hackgt13-project/scripts/phone-qr.sh
# Leave the terminal open. The QR is written to ~/Desktop/formal-connection-expo.png.
set -euo pipefail

find_repo_root() {
  local start dir
  start="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if dir="$(git -C "$start" rev-parse --show-toplevel 2>/dev/null)"; then
    printf '%s\n' "$dir"
    return 0
  fi
  dir="$start"
  while [ "$dir" != "/" ]; do
    if [ -e "$dir/.git" ] && [ -d "$dir/mobile" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "Could not find the Formal Connection repo (looked from $start)." >&2
  exit 1
}

ROOT="$(find_repo_root)"
cd "$ROOT"

if [ -z "$(git status --porcelain)" ] && [ "$(git branch --show-current)" = "main" ]; then
  git pull origin main || echo "Pull failed. Starting the code already on disk."
else
  echo "Not pulling: this checkout is not a clean main. Starting the code already on disk."
fi

cd "$ROOT/mobile"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created mobile/.env from mobile/.env.example. The app already knows the team project."
fi

if [ ! -d node_modules ]; then
  echo "Installing mobile dependencies (first run)..."
  npm install
fi

LOG="${TMPDIR:-/tmp}/formal-connection-expo.log"
: >"$LOG"
npx expo start --go --tunnel --clear >"$LOG" 2>&1 &
EXPO_PID=$!

cleanup() {
  if kill -0 "$EXPO_PID" 2>/dev/null; then
    kill "$EXPO_PID" 2>/dev/null || true
    wait "$EXPO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting the tunnel. This usually takes under a minute."
PHONE_URL=""
for _ in $(seq 1 45); do
  if ! kill -0 "$EXPO_PID" 2>/dev/null; then
    echo "Expo stopped before the tunnel was ready. Log:" >&2
    tail -n 40 "$LOG" >&2
    exit 1
  fi
  PHONE_URL="$(python3 - <<'PY' 2>/dev/null || true
import json, urllib.request
try:
    with urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels", timeout=2) as r:
        data = json.load(r)
except Exception:
    raise SystemExit(0)
for tunnel in data.get("tunnels", []):
    public = tunnel.get("public_url") or ""
    host = public.split("://", 1)[-1].strip("/")
    if host.endswith(".exp.direct"):
        print("exp://" + host)
        break
PY
)"
  if [ -n "$PHONE_URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$PHONE_URL" ]; then
  echo "Tunnel did not come up. Log:" >&2
  tail -n 40 "$LOG" >&2
  exit 1
fi

QR_DIR="${HOME}/Desktop"
if [ ! -d "$QR_DIR" ]; then
  QR_DIR="$ROOT"
fi
QR_FILE="${QR_DIR}/formal-connection-expo.png"
npx --yes qrcode -o "$QR_FILE" -w 640 -e H "$PHONE_URL"
if [ "$(uname -s)" = "Darwin" ]; then
  open "$QR_FILE" || true
fi

echo ""
echo "PHONE_URL=${PHONE_URL}"
echo "QR_FILE=${QR_FILE}"
echo "Scan that QR with Expo Go. It loads the app from this laptop."
echo "Leave this terminal open and keep the laptop awake."
echo "This server checks GitHub every 60 s and hot-reloads the latest main, so every phone on it stays current."
echo ""

# Keep the served code current (AGENTS.md "Keep local previews current"): fast-forward a clean main only,
# never over uncommitted work or local commits. New dependencies are installed; a restart is needed for them.
sync_loop() {
  while kill -0 "$EXPO_PID" 2>/dev/null; do
    sleep 60
    if ! git -C "$ROOT" fetch -q origin main 2>/dev/null; then
      echo "[sync] could not reach GitHub; the app may be behind." ; continue
    fi
    if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ] || [ "$(git -C "$ROOT" branch --show-current)" != "main" ]; then
      continue
    fi
    counts="$(git -C "$ROOT" rev-list --left-right --count HEAD...origin/main)"
    ahead="${counts%%[[:space:]]*}"; behind="${counts##*[[:space:]]}"
    if [ "$ahead" = "0" ] && [ "$behind" != "0" ]; then
      before="$(git -C "$ROOT" rev-parse HEAD)"
      if git -C "$ROOT" merge --ff-only -q origin/main; then
        echo "[sync] updated to $(git -C "$ROOT" log --oneline -1)"
        if ! git -C "$ROOT" diff --quiet "$before" HEAD -- mobile/package.json mobile/package-lock.json; then
          echo "[sync] dependencies changed: installing. Restart this script if the app shows a missing module."
          (cd "$ROOT/mobile" && npm install --silent) || true
        fi
      fi
    fi
  done
}
sync_loop &

wait "$EXPO_PID"
