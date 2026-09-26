---
name: contract-change
description: "Required procedure for changing any shared contract (docs/schema.sql, docs/api.md, docs/mocks/, Supabase migrations, endpoint request or response shapes, env vars). Use whenever a task needs a new table, column, endpoint, field, env var, or changed payload, even a tiny one, and whenever code and docs disagree."
argument-hint: "[what needs to change and why]"
---

# Contract change: $ARGUMENTS

1. Confirm it's needed: re-read MASTER_SPEC Sections 8 and 9. Prefer what already exists.
2. Make the smallest change that works and keep it additive: a new column with a default, a new table, a new optional field. Never rename or remove something another owner uses.
3. In ONE commit:
   - Schema: a new file in `supabase/migrations/` plus the same change in `docs/schema.sql`, with RLS written in the style of Section 8.3.
   - API: update `docs/api.md` in its existing style (request, response, errors) and add or update the example in `docs/mocks/<method>-<path>.json`.
   - Env: add the variable to `.env.example` with no value.
4. Update the callers you own. For callers another owner owns, leave a precise note in PROGRESS.md and a `- [ ] (from <you>)` item in their `REQUESTS.md` section instead of editing their folder. No one's approval is needed: there is no team lead.
5. Ask `contract-keeper` to confirm code and docs agree.
6. Fill "Contract changes" in the PROGRESS.md entry (file, what changed, who is affected), then run `/handoff`.
