-- MASTER_SPEC Section 8.1 + 8.2, verbatim. Applied on top of docs/schema.sql.
-- Test-only copy until AD1 lands these in docs/schema.sql / supabase migrations.

-- Open to Meet replaces "open to chat"
alter table presence rename column open_to_chat to open_to_meet;
-- profiles: manual LinkedIn-style fields, settings, account tier
alter table profiles
 add column headline text default '',
 add column experience text default '', -- pasted/typed LinkedIn-style experience
 add column open_to_meet boolean default false, -- the home toggle
 add column web_search_opt_in boolean default false,
 add column account_type text default 'individual' check (account_type in ('individual','organization')),
 add column is_synthetic boolean default false; -- seeded demo profiles, excluded from training on real data
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

create table conversations ( -- a verified in-person conversation
 id bigserial primary key,
 user_a uuid references profiles(id) on delete cascade, -- user_a < user_b
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
create table suggestions ( -- "Do you want to meet X?"
 id bigserial primary key,
 user_a uuid references profiles(id) on delete cascade,
 user_b uuid references profiles(id) on delete cascade,
 context text check (context in ('event','public','reconnect')),
 event_id bigint references events(id),
 building_id text,
 score real,
 shared_topics jsonb, -- [{interest_id, name, contribution}]
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
create table location_shares ( -- live meetup sharing, deleted when it ends
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
 token_hash text unique not null, -- store only a hash of the link/QR token
 channel text check (channel in ('link','qr','contact')),
 recipient_hint text, -- e.g. contact name, never shown publicly
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
create table event_posts ( -- attendee space feed (not a group chat)
 id bigserial primary key,
 event_id bigint references events(id) on delete cascade,
 author_id uuid references profiles(id) on delete cascade,
 body text not null,
 created_at timestamptz default now()
);
create table feed_items ( -- connections feed: github activity, posts, self-reported updates
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
 kind text, -- suggestion, connect_prompt, connected, invite, event_update, connection_attending
 payload jsonb,
 read boolean default false,
 created_at timestamptz default now()
);
