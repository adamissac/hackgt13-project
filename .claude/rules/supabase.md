---
paths:
  - "supabase/**"
  - "docs/schema.sql"
---
# Database rules (Supabase)
- Schema changes only as new migration files (`supabase migration new <name>`). Never edit an applied migration. Mirror the change in `docs/schema.sql` in the same commit.
- RLS enabled on every table in `public`, with policies exactly as MASTER_SPEC 8.3. Tables marked "no client access" get RLS on and no client policies.
- Never authorize with `user_metadata` claims: users can edit them.
- Tables that stream to clients (messages, location_shares, notifications) must be in the `supabase_realtime` publication. RLS still applies to what streams.
- Resumes live in a private Storage bucket under `<user_id>/...` with owner-only policies.
- No destructive SQL against the remote project (DROP, TRUNCATE, DELETE without WHERE, `supabase db reset --linked`), especially once real attendees onboard.
