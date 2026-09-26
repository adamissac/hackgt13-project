# Onboarding and the skill profile

Every new account, whatever auth provider created it, goes through onboarding (connect GitHub, upload
a resume), and every source a user adds feeds the background **skill-profile builder**. Matching reads
the resulting profile.

> ⚠️ **Adding an auth provider?** Read [the checklist](#when-adding-a-new-auth-provider) first. CI fails if a
> signup path can skip this.

## 1. The shared account-creation hook

| Where | What |
| --- | --- |
| `supabase/migrations/20260926200000_skill_profiles_and_on_create_account.sql` | **`public.on_create_account()`**, the trigger on `auth.users` insert. This is the single choke point. |
| `ml/app/users.py` → `on_create_account(user_id)` | Server fallback for ordering races only; creates the same row. |
| `mobile/app/_layout.tsx` | The gate: any signed-in user whose `profiles.onboarding_status = 'pending'` sees `app/onboarding.tsx` first. |

Why a database trigger: Supabase Auth creates every account (email/password, magic link, LinkedIn OIDC,
and any future Google/GitHub/SAML provider) by inserting into `auth.users`. One trigger therefore
covers every provider with no per-provider code. It creates the `profiles` row with
`onboarding_status = 'pending'`.

`onboarding_status`:
- `pending`: hasn't finished the onboarding screen. The app shows onboarding before anything else.
- `partial`: skipped, or added a source that failed to parse. Home shows a dismissible "Finish your profile" banner.
- `complete`: the builder produced a profile with at least one skill. Set by the builder, and by a trigger on the first `user_interests` row.

## 2. Onboarding UI (`mobile/app/onboarding.tsx`)

- **Connect GitHub**: OAuth through the ML service (`GET /connect/github/start`, `read:user` scope,
  public repos only). The token stays server-side, encrypted (`linked_accounts`). No sign-in provider
  uses GitHub today. If one is added, it must still send users here so the read scope is granted.
- **Upload resume**: PDF or DOCX, up to 10 MB, `POST /profile/ingest` (multipart).
- Both are skippable. "Building your profile…" polls `onboarding_status` until it's `complete`.
- Later: Profile → Edit profile (`app/accounts.tsx`) has the same actions.

## 3. Background job: profile builder

Job infrastructure: FastAPI `BackgroundTasks` plus the in-process job registry (`ml/app/jobs.py`). There
is no separate queue; this matches the rest of the service.

```
GitHub connect ──► ingest_github ─┐
Resume upload ──► resumes.process ─┼─► profile_store.ingest_text ─► LLM extraction ─► canonicalize ─► user_interests
Manual edits ────────────────────┘                                                                     │
                                                                  skill_profile.build_safely(user, source) ◄┘
```

- **GitHub extraction** (`ml/ml/github_ingest.py`): the 30 most recently pushed public non-fork repos.
  It collects languages by byte count, READMEs, stars, forks and `pushed_at`. For the top 8 repos (pinned
  first, then stars) it also reads **frameworks from manifests** (`package.json`, `requirements.txt`,
  `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`) and **commits in the
  last year**. **Pinned repos** come from GraphQL. ETag caching keeps repeat runs nearly free.
- **Resume extraction**: PDF via pdfplumber, DOCX via python-docx (`ml/ml/resume_structure.py`).
  Structure (experience with dates, education, named skills, certifications, free-text sections) comes
  from Claude Haiku when `ANTHROPIC_API_KEY` is set, and from a heuristic parser otherwise or on failure.
  The file is stored in the private `resumes` bucket, and a `resumes` row tracks it
  (`uploaded` → `parsed` or `failed`).
- **Skill normalization** (`ml/ml/skill_taxonomy.py` + `profile_store.canonicalize`):
  1. An alias table (`JS`/`Javascript`/`ECMAScript` → `javascript`).
  2. Embedding similarity: merge at cosine ≥ 0.88, with an LLM tie-break between 0.80 and 0.88.
  3. Each skill gets a confidence (noisy-OR across sources) and `sources` (`github`, `resume`, or both).
- **Profile writer** (`ml/app/skill_profile.py`): stores versioned rows in `user_skill_profiles`. Exactly
  one row per user is active; history is kept.
- **Idempotency**:
  - Inputs are hashed (latest document id per source plus active weights) under a per-user advisory
    lock. The same inputs produce no new version.
  - Enqueues are de-duplicated on `(user_id, trigger_source)`. A request that arrives mid-run triggers
    exactly one more run.
- **Failures**: a parse or extraction failure logs, marks the `resumes` row `failed`, sets
  `onboarding_status` to `partial` if it was `pending`, and never blocks the user.

### Profile JSON (`user_skill_profiles.profile`, `GET /profile/skills`)

```json
{
  "user_id": "…",
  "skills": [{"name": "python", "confidence": 0.92, "sources": ["github", "resume"]}],
  "experience_years_estimate": 3.5,
  "domains": ["ml", "backend"],
  "project_highlights": [{"name": "rag-eval", "description": "…", "stars": 12, "forks": 2,
    "languages": ["Python"], "frameworks": ["fastapi", "pytorch"], "commits_last_year": 80, "pinned": true, "url": "…"}],
  "education": [], "certifications": [],
  "generated_at": "2026-09-26T19:00:00Z",
  "profile_version": 1
}
```

`user_skill_profiles.skills` holds the same skills plus `interest_id`, for indexing (GIN `jsonb_path_ops`).

## 4. Matching integration

`ml/app/population.py` → `load_people()` reads `user_interests` (the LLM extraction, with user
confirm/hide) **and the active `user_skill_profiles` version**. Skills that exist only in the profile
(frameworks from manifests, languages by bytes, resume skill lists) join the person's interests at
0.8 × confidence. Hidden interests never come back. No profile means an empty skill set, never an error.
Indexes: `user_interests (interest_id) where not hidden`, GIN on `user_skill_profiles.skills`, and a
unique partial index on the active version.

## 5. Tests / CI

- `ml/tests/test_onboarding_enforcement.py` checks four things:
  1. The latest `auth.users` insert trigger calls `on_create_account()`, and it's the only one.
  2. That function sets `pending` and carries the warning.
  3. Server code creates `profiles` only in `app/users.py`.
  4. Mobile never inserts profiles, and its root layout gates on onboarding.

  With a database, it signs up one user **per provider in `AUTH_PROVIDERS`** through the real trigger and
  asserts `onboarding_status = 'pending'`.
- `ml/tests/test_skill_profile.py`: taxonomy, manifests, resume structure, DOCX, composition, versioning
  and idempotency, and matching fallback.
- `.github/workflows/ci.yml` runs both against Postgres with pgvector, plus mobile tsc, eslint and `npm run test:demo`.

## When adding a new auth provider

1. Enable it in Supabase Auth (`supabase/config.toml` or the dashboard). It must create users in
   `auth.users`, which every Supabase provider does. **Do not** create `profiles` rows yourself.
2. Add its provider name to `AUTH_PROVIDERS` in `ml/tests/test_onboarding_enforcement.py`.
3. Add the sign-in button in `mobile/app/sign-in.tsx` / `mobile/lib/auth.tsx`. The onboarding gate
   in `mobile/app/_layout.tsx` needs no change.
4. If the provider grants data the builder can use (for example GitHub), still send users through
   onboarding so the read scope is requested explicitly.
5. Run `cd ml && python -m pytest tests/test_onboarding_enforcement.py`. CI must be green.
