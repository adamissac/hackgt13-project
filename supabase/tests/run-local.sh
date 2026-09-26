#!/usr/bin/env bash
# Replays supabase/migrations/ into a throwaway local Postgres (needs pgvector) and runs rls_checks.sql.
# No secrets needed. Usage from repo root: ./supabase/tests/run-local.sh
# PSQL defaults to `sudo -u postgres psql`; override with e.g. PSQL="psql -h localhost -U postgres".
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
PSQL="${PSQL:-sudo -u postgres psql}"
DB="${DB:-fc_ad1_check}"

$PSQL -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/supabase_stub.sql" 2>&1 | grep -v -e wal_level -e HINT || true
for f in "$ROOT"/supabase/migrations/*.sql; do
  $PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  echo "applied $(basename "$f")"
done
$PSQL -q -At -d "$DB" -f "$ROOT/supabase/tests/rls_checks.sql" | grep -v '^$'
$PSQL -q -d postgres -c "drop database $DB"
