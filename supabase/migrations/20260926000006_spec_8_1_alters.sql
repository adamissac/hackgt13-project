-- MASTER_SPEC 8.1: required changes to existing tables
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
