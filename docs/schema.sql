-- Run in Supabase: SQL Editor > New query > paste > Run.
-- Source of truth for table/column names. Tell the team before changing.

create extension if not exists vector;

-- ---------- people ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  photo_url text,
  role text not null default 'student' check (role in ('student','recruiter')),
  major text,
  grad_year int,
  seeking text default '',
  offering text default '',
  created_at timestamptz default now()
);

create table linked_accounts (
  user_id uuid references profiles(id) on delete cascade,
  provider text check (provider in ('github','facebook','tiktok')),
  provider_uid text,
  access_token_enc text,          -- encrypted by ML service, never readable by the app
  refresh_token_enc text,
  scopes text,
  fetched_at timestamptz,
  primary key (user_id, provider)
);

create table raw_documents (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  source text check (source in ('resume','linkedin','github','facebook','tiktok','manual','photos')),
  text text,
  meta jsonb default '{}',
  fetched_at timestamptz default now()
);

-- ---------- interests ----------
create table interests (
  id bigserial primary key,
  canonical_name text unique not null,
  facet text check (facet in ('technical','career','personal','academic')),
  embedding vector(384),
  idf real default 1.0
);
create index interests_embedding_idx on interests using hnsw (embedding vector_cosine_ops);

create table user_interests (
  user_id uuid references profiles(id) on delete cascade,
  interest_id bigint references interests(id) on delete cascade,
  weight real not null,
  source text,
  evidence text,
  confirmed boolean default false,
  hidden boolean default false,
  primary key (user_id, interest_id)
);

create table profile_vectors (
  user_id uuid references profiles(id) on delete cascade,
  facet text check (facet in ('technical','career','personal','academic','combined','seeking','offering')),
  vector vector(384),
  updated_at timestamptz default now(),
  primary key (user_id, facet)
);
create index profile_vectors_idx on profile_vectors using hnsw (vector vector_cosine_ops);

-- ---------- events ----------
create table events (
  id bigserial primary key,
  name text not null,
  venue text,
  starts_at timestamptz,
  ends_at timestamptz,
  floorplan_url text
);

create table event_zones (
  id bigserial primary key,
  event_id bigint references events(id) on delete cascade,
  name text,
  beacon_token text,
  x real, y real
);

create table attendance (
  event_id bigint references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  checked_in_at timestamptz default now(),
  primary key (event_id, user_id)
);

-- ---------- proximity + handshakes ----------
create table device_keys (
  user_id uuid primary key references profiles(id) on delete cascade,
  public_key text not null            -- Ed25519, base64
);

create table ephemeral_ids (
  token text primary key,
  user_id uuid references profiles(id) on delete cascade,
  valid_from timestamptz,
  valid_to timestamptz
);

create table sightings (               -- delete rows older than 24h with a scheduled job
  id bigserial primary key,
  observer_id uuid references profiles(id) on delete cascade,
  observed_token text,
  rssi smallint,
  ts timestamptz,
  zone_id bigint
);

create table encounters (
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  event_id bigint references events(id),
  start_ts timestamptz,
  end_ts timestamptz,
  features jsonb,
  p_conversation real
);

create table handshakes (
  id bigserial primary key,
  scanner_id uuid references profiles(id) on delete cascade,
  scanned_id uuid references profiles(id) on delete cascade,
  event_id bigint references events(id),
  nonce text unique,
  ts timestamptz default now()
);

create table feedback (
  handshake_id bigint references handshakes(id) on delete cascade,
  rater_id uuid references profiles(id) on delete cascade,
  talked_about bigint[] default '{}',  -- interest ids from the checklist
  other_topic text,
  wants_connect boolean not null,
  created_at timestamptz default now(),
  primary key (handshake_id, rater_id)
);

create table connections (
  user_a uuid references profiles(id) on delete cascade,   -- always user_a < user_b
  user_b uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table impressions (             -- every match shown, for training the ranker
  id bigserial primary key,
  viewer_id uuid references profiles(id) on delete cascade,
  shown_id uuid references profiles(id) on delete cascade,
  event_id bigint,
  rank int,
  score real,
  model text,
  ts timestamptz default now()
);

-- ---------- open to chat ----------
create table presence (
  user_id uuid primary key references profiles(id) on delete cascade,
  building_id text not null,
  open_to_chat boolean default false,
  expires_at timestamptz not null
);

create table chat_invites (
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  building_id text,
  a_response text check (a_response in ('pending','accept','decline')) default 'pending',
  b_response text check (b_response in ('pending','accept','decline')) default 'pending',
  created_at timestamptz default now()
);

create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  primary key (blocker_id, blocked_id)
);

-- ---------- row level security (app uses anon key; ML service uses service key and bypasses RLS) ----------
alter table profiles enable row level security;
create policy "read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "edit own profile" on profiles for update using (auth.uid() = id);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);

alter table user_interests enable row level security;
create policy "read own interests" on user_interests for select using (auth.uid() = user_id);

alter table connections enable row level security;
create policy "read own connections" on connections for select
  using (auth.uid() = user_a or auth.uid() = user_b);

alter table linked_accounts enable row level security;   -- no policies: only the ML service touches it
alter table sightings enable row level security;
alter table feedback enable row level security;
alter table impressions enable row level security;
alter table presence enable row level security;
alter table blocks enable row level security;
create policy "manage own blocks" on blocks for all using (auth.uid() = blocker_id);

-- demo event (times are placeholders, fix to the real schedule)
insert into events (name, venue, starts_at, ends_at)
values ('HackGT 13', 'Georgia Tech', '2026-09-25 18:00-04', '2026-09-27 14:00-04');

-- ========== MASTER_SPEC Section 8 (applied as supabase/migrations/*_spec_8_*.sql) ==========
-- RLS for these tables and the other hardening lives in supabase/migrations/; that folder is what runs.

-- Open to Meet replaces "open to chat"
alter table presence rename column open_to_chat to open_to_meet;

-- profiles: manual LinkedIn-style fields, settings, account tier
alter table profiles
  add column headline text default '',
  add column experience text default '',          -- pasted/typed LinkedIn-style experience
  add column open_to_meet boolean default false,  -- the home toggle
  add column web_search_opt_in boolean default false,
  add column account_type text default 'individual' check (account_type in ('individual','organization')),
  add column is_synthetic boolean default false;   -- seeded demo profiles, excluded from training on real data

-- connections: how they met
alter table connections
  add column how_met text check (how_met in ('in_person','invite')) default 'in_person',
  add column conversation_id bigint,
  add column invite_id bigint;

-- events: organizer and details
alter table events
  add column org_id bigint,
  add column description text default '',
  add column location_text text default '';

-- feedback is keyed on a verified conversation (handshakes remain as QR verification records)
alter table feedback drop constraint if exists feedback_pkey;
alter table feedback add column conversation_id bigint;
alter table feedback alter column handshake_id drop not null;
alter table feedback add constraint feedback_conversation_rater unique (conversation_id, rater_id);

create table conversations (            -- a verified in-person conversation
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,   -- user_a < user_b
  user_b uuid references profiles(id) on delete cascade,
  method text check (method in ('ble','qr')) not null,
  event_id bigint references events(id),
  suggestion_id bigint,
  started_at timestamptz, ended_at timestamptz,
  minutes real,
  p_conversation real,
  created_at timestamptz default now(),
  check (user_a < user_b)
);

create table suggestions (              -- "Do you want to meet X?"
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  context text check (context in ('event','public','reconnect')),
  event_id bigint references events(id),
  building_id text,
  score real,
  shared_topics jsonb,                  -- [{interest_id, name, contribution}]
  a_response text check (a_response in ('pending','yes','no')) default 'pending',
  b_response text check (b_response in ('pending','yes','no')) default 'pending',
  status text check (status in ('pending','matched','expired')) default 'pending',
  created_at timestamptz default now(),
  expires_at timestamptz
);

create table chats (
  id bigserial primary key,
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  origin text check (origin in ('suggestion','connection')),
  created_at timestamptz default now(),
  unique (user_a, user_b)
);

create table messages (
  id bigserial primary key,
  chat_id bigint references chats(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  body text not null,
  is_ai_draft boolean default false,
  created_at timestamptz default now()
);

create table location_shares (          -- live meetup sharing, deleted when it ends
  suggestion_id bigint references suggestions(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  lat double precision, lng double precision,
  updated_at timestamptz default now(),
  expires_at timestamptz not null,
  primary key (suggestion_id, user_id)
);

create table invites (
  id bigserial primary key,
  sender_id uuid references profiles(id) on delete cascade,
  token_hash text unique not null,      -- store only a hash of the link/QR token
  channel text check (channel in ('link','qr','contact')),
  recipient_hint text,                  -- e.g. contact name, never shown publicly
  note text,
  status text check (status in ('active','accepted','declined','revoked','expired')) default 'active',
  used_by uuid references profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table organizations (
  id bigserial primary key,
  name text not null,
  owner_id uuid references profiles(id),
  created_at timestamptz default now()
);
create table org_members (
  org_id bigint references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'admin',
  primary key (org_id, user_id)
);
create table org_subscriptions (
  org_id bigint references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (org_id, user_id)
);
create table event_registrations (
  event_id bigint references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  registered_at timestamptz default now(),
  primary key (event_id, user_id)
);
create table event_posts (              -- attendee space feed (not a group chat)
  id bigserial primary key,
  event_id bigint references events(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table feed_items (               -- connections feed: github activity, posts, self-reported updates
  id bigserial primary key,
  author_id uuid references profiles(id) on delete cascade,
  kind text check (kind in ('github','post','update')),
  title text, body text,
  url text,
  payload jsonb default '{}',
  embedding vector(384),
  created_at timestamptz default now()
);
create table feed_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  show_github boolean default true,
  show_posts boolean default true,
  show_updates boolean default true
);

create table web_mentions (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  url text, title text, snippet text,
  status text check (status in ('pending','approved','rejected')) default 'pending',
  created_at timestamptz default now()
);

create table notifications (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete cascade,
  kind text,                            -- suggestion, connect_prompt, connected, invite, event_update, connection_attending
  payload jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

-- AD10: Expo push tokens (supabase/migrations/20260926000009_push_tokens.sql). Owner-only table rather than
-- a profiles column, since other users can read profile rows. RLS: owner select/insert/update/delete.
create table push_tokens (
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null,                  -- ExponentPushToken[...]
  platform text check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- ========== Onboarding (supabase/migrations/20260926190000_onboarding_status.sql) ==========
alter table profiles add column onboarding_status text not null default 'pending'
  check (onboarding_status in ('pending', 'partial', 'complete'));
-- trigger on user_interests insert sets 'complete' (first successful profile build)

-- ========== Skill profiles (supabase/migrations/20260926200000_skill_profiles_and_on_create_account.sql) ==========
-- on_create_account(): trigger on auth.users insert, the single account-creation hook for every auth provider
create table resumes (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null, filename text not null default '',
  mime_type text not null,              -- application/pdf | ...wordprocessingml.document (DOCX)
  size_bytes int not null,              -- <= 10 MB
  status text not null default 'uploaded' check (status in ('uploaded','parsed','failed')),
  error text, raw_document_id bigint references raw_documents(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table user_skill_profiles (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  version int not null, is_active boolean not null default true,
  trigger_source text not null,         -- github | resume | manual | rebuild
  input_hash text not null,             -- same inputs -> no new version (idempotent re-runs)
  profile jsonb not null,               -- see docs/ONBOARDING.md
  skills jsonb not null default '[]',   -- [{name, interest_id, confidence, sources}]
  generated_at timestamptz not null default now(),
  unique (user_id, version)
);
create unique index user_skill_profiles_active_idx on user_skill_profiles (user_id) where is_active;
create index user_skill_profiles_skills_gin on user_skill_profiles using gin (skills jsonb_path_ops);
create index user_interests_interest_idx on user_interests (interest_id) where not hidden;
