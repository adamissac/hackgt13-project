
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

