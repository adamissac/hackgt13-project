#!/usr/bin/env bash
# Start the Expo Go dev server from any folder (LAN). Campus Wi-Fi often blocks this.
# For a phone QR that works on campus, run scripts/phone-qr.sh instead.
# Usage: /path/to/hackgt13-project/scripts/start-app.sh
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

if [ ! -f mobile/package.json ]; then
  echo "No mobile/package.json in $ROOT. Clone hackgt13-project and run this script from that repo." >&2
  exit 1
fi

if [ -z "$(git status --porcelain --untracked-files=no)" ] && [ "$(git branch --show-current)" = "main" ]; then
  git pull --ff-only origin main || echo "Pull failed. Starting the code already on disk."
else
  echo "Not pulling: this checkout is not a clean main. Starting the code already on disk."
fi

cd mobile

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created mobile/.env from mobile/.env.example. Open mobile/.env and fill it in (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY). Leave EXPO_PUBLIC_USE_MOCKS=1 to try the app without a live server."
fi

use_mocks="$(grep -E '^EXPO_PUBLIC_USE_MOCKS=' .env | tail -n 1 | cut -d= -f2- | tr -d '[:space:]"'\' || true)"
api_url="$(grep -E '^EXPO_PUBLIC_API_BASE_URL=' .env | tail -n 1 | cut -d= -f2- | tr -d '[:space:]"'\' || true)"
if [ "$use_mocks" = "0" ] && [ -z "$api_url" ]; then
  echo "Warning: EXPO_PUBLIC_USE_MOCKS=0 but EXPO_PUBLIC_API_BASE_URL is empty. Set the ML API URL in mobile/.env, or set EXPO_PUBLIC_USE_MOCKS=1." >&2
fi

if [ ! -d node_modules ]; then
  echo "Installing mobile dependencies (first run)..."
  npm install
fi

# --tunnel, not --lan: Supabase Auth rejects sign-in return links on raw IP hosts (exp://10.x.x.x),
# so LinkedIn / email-link sign-in only returns to Expo Go through a tunnel URL (*.exp.direct).
exec npx expo start --go --tunnel --clear
