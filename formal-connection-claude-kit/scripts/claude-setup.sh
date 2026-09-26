#!/usr/bin/env bash
# One-time Claude Code setup for the Formal Connection repo. Safe to rerun.
# Usage: ./scripts/claude-setup.sh <adam|alan|arjun|akshar>
set -uo pipefail

OWNER="${1:-}"
case "$OWNER" in
  adam|alan|arjun|akshar) ;;
  *) echo "Usage: $0 <adam|alan|arjun|akshar>"; exit 1 ;;
esac

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then echo "Run this from inside the repo."; exit 1; fi
cd "$ROOT" || exit 1

# 1. Tools
missing=0
for t in git python3 node npm; do
  command -v "$t" >/dev/null 2>&1 || { warn "$t not found. Install it, then rerun."; missing=1; }
done
HAVE_CLAUDE=1
command -v claude >/dev/null 2>&1 || { HAVE_CLAUDE=0; warn "Claude Code not found. Install it (https://code.claude.com/docs/en/setup), then rerun to add plugins."; }
[ "$missing" = 1 ] && warn "Continuing with what's available."

# 2. Owner file and .gitignore
mkdir -p .claude
printf '%s\n' "$OWNER" > .claude/owner.local
touch .gitignore
for line in ".env" ".env.*" "!.env.example" ".claude/owner.local" ".claude/settings.local.json" "CLAUDE.local.md" "ml/data/external/"; do
  grep -qxF -- "$line" .gitignore || printf '%s\n' "$line" >> .gitignore
done
say "Owner set to $OWNER (.claude/owner.local, gitignored)"

# 3. Hooks: executable, and the shared git pre-commit guard
chmod +x .claude/hooks/*.py .claude/statusline.py .githooks/pre-commit scripts/*.sh 2>/dev/null || true
git config core.hooksPath .githooks
say "Git pre-commit guard enabled (core.hooksPath=.githooks)"

# 4. User settings: auto mode + what the auto-mode classifier should trust.
#    Claude Code only reads defaultMode "auto" and autoMode rules from ~/.claude/settings.json,
#    so this is the one file outside the repo we touch. A timestamped backup is written first.
if command -v python3 >/dev/null 2>&1; then
python3 - "$ROOT" <<'PY'
import json, os, re, shutil, sys, time
root = sys.argv[1]
path = os.path.expanduser("~/.claude/settings.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
data = {}
if os.path.exists(path):
    try:
        with open(path) as fh:
            data = json.load(fh)
    except Exception:
        print("[!] ~/.claude/settings.json isn't valid JSON, so it was left alone. Fix it and rerun.")
        sys.exit(0)
    shutil.copy(path, f"{path}.bak-{int(time.time())}")

ref = ""
try:
    with open(os.path.join(root, ".mcp.json")) as fh:
        m = re.search(r"project_ref=([a-z0-9]{12,})", fh.read())
        ref = m.group(1) if m else ""
except Exception:
    pass
supa = f"{ref}.supabase.co" if ref else "our Supabase project's *.supabase.co host"
TAG = "(formal-connection)"

perm = data.setdefault("permissions", {})
old_mode = perm.get("defaultMode")
perm["defaultMode"] = "auto"

am = data.setdefault("autoMode", {})

def merge(key, entries):
    cur = am.get(key)
    cur = ["$defaults"] if cur is None else [e for e in cur if TAG not in str(e)]
    am[key] = cur + [f"{e} {TAG}" for e in entries]

merge("environment", [
    "Organization: HackGT 13 student team (Adam, Alan, Arjun, Akshar) building the Formal Connection networking app. Primary use: software development.",
    "Source control: the GitHub repository in the working directory and its origin remote, including teammate branches named <owner>/<task>.",
    f"Trusted internal domains: {supa}, mcp.supabase.com, api.anthropic.com, api.github.com, github.com, mcp.context7.com, exp.host, localhost, 127.0.0.1, *.trycloudflare.com tunnels the team starts for the FastAPI dev server, and our Vercel deployment of dashboard/.",
    "Key internal services: our Supabase project (Postgres, Auth, Storage, Realtime), Expo EAS builds for our app, Vercel for the dashboard, Railway or Render if we deploy the FastAPI service.",
    "Sensitive data locations & audiences: from HackGT Saturday onward the Supabase project holds real attendee data (profiles, interests, locations, messages). Only the app's own services may read it; never export it, paste it into chats, or send it to third parties.",
])
merge("allow", [
    "Applying new, additive migration files from supabase/migrations to our Supabase project with `supabase db push` is allowed.",
    "Starting a cloudflared quick tunnel to the local FastAPI dev server on localhost:8000 so teammates' phones can reach it is allowed.",
    "Running Expo development builds (`eas build --profile development`, `npx expo run:ios`, `npx expo run:android`) for our app is allowed.",
    "Deploying dashboard/ to our Vercel project, and the FastAPI service in ml/ to our Railway or Render project, is allowed.",
])
merge("soft_deny", [
    "Never run DROP TABLE, TRUNCATE, DELETE without a WHERE clause, or `supabase db reset --linked` against the remote Supabase project.",
])
merge("hard_deny", [
    "Never scrape, crawl, or automate logins to LinkedIn or Instagram, including through browser automation, headless browsers, scraping libraries, or third-party data APIs. LinkedIn is used only for OIDC sign-in.",
])

with open(path, "w") as fh:
    json.dump(data, fh, indent=2)
print(f"==> ~/.claude/settings.json: defaultMode auto (was {old_mode or 'unset'}), autoMode rules for this project added (backup saved)")
PY
fi

# 5. Plugins from Anthropic's official marketplace, installed for this repo only (local scope)
if [ "$HAVE_CLAUDE" = 1 ]; then
  claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 || true
  COMMON="typescript-lsp pyright-lsp"
  case "$OWNER" in
    adam)   EXTRA="expo supabase frontend-design feature-dev security-guidance" ;;
    alan)   EXTRA="feature-dev security-guidance" ;;
    arjun)  EXTRA="frontend-design vercel feature-dev" ;;
    akshar) EXTRA="expo frontend-design security-guidance" ;;
  esac
  for p in $COMMON $EXTRA; do
    if claude plugin install "$p@claude-plugins-official" --scope local >/dev/null 2>&1; then
      say "plugin: $p"
    else
      warn "plugin $p didn't install. Inside Claude Code run: /plugin install $p@claude-plugins-official"
    fi
  done
fi

# 6. Language servers the LSP plugins need
if command -v npm >/dev/null 2>&1; then
  command -v typescript-language-server >/dev/null 2>&1 || npm install -g typescript-language-server typescript >/dev/null 2>&1 \
    || warn "Couldn't install typescript-language-server globally. Try: npm install -g typescript-language-server typescript"
  command -v pyright-langserver >/dev/null 2>&1 || npm install -g pyright >/dev/null 2>&1 \
    || warn "Couldn't install pyright globally. Try: npm install -g pyright"
fi

# 7. Reminders
if grep -q "YOUR_PROJECT_REF" .mcp.json 2>/dev/null; then
  warn "Adam: replace YOUR_PROJECT_REF in .mcp.json with the Supabase project ref (Project Settings > General), commit, push. Everyone reruns this script after pulling."
fi
echo
say "Setup done for $OWNER. Start with:"
echo "      claude \"\$(cat prompts/$OWNER.md)\""
say "First session: accept the folder trust prompt and the project MCP servers, then run /mcp and sign in to Supabase."
