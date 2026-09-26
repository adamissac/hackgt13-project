-- Skill-profile onboarding (docs/ONBOARDING.md).
--   1. on_create_account(): the ONE place every new account is finalized, for every auth provider.
--   2. resumes: uploaded resume files (object in the private `resumes` bucket) linked to the user.
--   3. user_skill_profiles: versioned structured skill profiles; one active version per user.
--   4. Indexes for skill lookups in matching.

-- ---------------------------------------------------------------- 1. shared account-creation hook
-- ⚠️ IMPORTANT — DO NOT REMOVE:
-- Every new-account creation path, regardless of auth provider, MUST
-- trigger the onboarding flow (GitHub connect + resume upload prompt)
-- and the background skill-profile-builder job. See docs/ONBOARDING.md.
-- If you are adding a new auth provider (SSO, another OAuth provider,
-- invite-based signup, etc.), you MUST wire it into the same
-- onCreateAccount() hook — do not create a new signup path that
-- bypasses this.
--
-- Why a database trigger: Supabase Auth creates every account (email/password, magic link,
-- LinkedIn OIDC, and any future Google/GitHub/SAML provider) by inserting into auth.users. A trigger
-- on that insert therefore runs for every provider with no per-provider code. It creates the
-- profiles row with onboarding_status = 'pending', which makes the app show onboarding before
-- anything else (mobile/app/_layout.tsx). The profile builder runs when the user adds a source.
create or replace function public.on_create_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, photo_url, onboarding_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    coalesce(new.raw_user_meta_data ->> 'picture', new.raw_user_meta_data ->> 'avatar_url'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.on_create_account();

-- The old name is gone so nothing can re-point the trigger at a function that skips onboarding.
drop function if exists public.handle_new_user();

-- ---------------------------------------------------------------- 2. resumes
create table if not exists resumes (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,                       -- <user_id>/<timestamp>-<filename> in bucket `resumes`
  filename text not null default '',
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 10485760),
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'failed')),
  error text,
  raw_document_id bigint references raw_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resumes_user_idx on resumes (user_id, created_at desc);

alter table resumes enable row level security;
create policy "resumes: owner read" on resumes for select to authenticated
  using (user_id = (select auth.uid()));
-- Writes go through the ML service (service key), which also stores the file.

-- The storage bucket itself allows the new DOCX type too (still 10 MB, still private).
update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    file_size_limit = 10485760
where id = 'resumes';

-- ---------------------------------------------------------------- 3. versioned skill profiles
create table if not exists user_skill_profiles (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  version int not null,
  is_active boolean not null default true,
  trigger_source text not null check (trigger_source in ('github', 'resume', 'manual', 'rebuild')),
  input_hash text not null,                          -- idempotency: same inputs -> no new version
  profile jsonb not null,                            -- {user_id, skills, experience_years_estimate, domains, project_highlights, generated_at, profile_version}
  skills jsonb not null default '[]'::jsonb,         -- [{name, interest_id, confidence, sources}] (copy of profile.skills for indexing)
  generated_at timestamptz not null default now(),
  unique (user_id, version)
);
-- Exactly one active version per user; matching reads that one.
create unique index if not exists user_skill_profiles_active_idx on user_skill_profiles (user_id) where is_active;
create index if not exists user_skill_profiles_skills_gin on user_skill_profiles using gin (skills jsonb_path_ops);

alter table user_skill_profiles enable row level security;
create policy "user_skill_profiles: owner read" on user_skill_profiles for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- 4. matching lookups
-- "Who has skill X" and the population loader's per-interest joins.
create index if not exists user_interests_interest_idx on user_interests (interest_id) where not hidden;
