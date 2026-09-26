#!/usr/bin/env bash
# Live AD1 check: table count, RLS coverage, HackGT 13 seed, applied migrations.
# Usage from anywhere: /path/to/repo/scripts/check-ad1-live.sh  (or ./scripts/check-ad1-live.sh from repo root)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
while [ "$ROOT" != "/" ]; do
  if [ -f "$ROOT/supabase/config.toml" ] || [ -d "$ROOT/.git" ]; then
    break
  fi
  ROOT="$(dirname "$ROOT")"
done
if [ ! -f "$ROOT/supabase/config.toml" ] && [ ! -d "$ROOT/.git" ]; then
  echo "Could not find repo root (expected supabase/config.toml or .git)." >&2
  exit 1
fi
cd "$ROOT"

SQL="select (select count(*) from pg_tables where schemaname='public') as tables, (select count(*) from pg_tables where schemaname='public' and rowsecurity) as tables_with_rls, (select string_agg(tablename, ', ') from pg_tables where schemaname='public' and not rowsecurity) as missing_rls, (select name from events where name='HackGT 13') as seed_event, (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations) as migrations"

echo "==> Live AD1 query (project must be linked: npx supabase link --project-ref mwfzgkikbmnghueolfnw)"
npx supabase db query --linked "$SQL"
echo
echo "Expected:"
echo "  tables = tables_with_rls = 36"
echo "  missing_rls empty, seed_event = HackGT 13"
echo "  9 migrations ending 20260926000009"
