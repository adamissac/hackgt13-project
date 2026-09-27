-- Company accounts: a separate login from attendees. Organizers own an org and events.
-- FastAPI writes these rows (service role). RLS stays owner/member-only.

alter table profiles
  add column if not exists account_kind text not null default 'person'
    check (account_kind in ('person', 'company'));

alter table organizations
  add column if not exists website text not null default '',
  add column if not exists industry text not null default '',
  add column if not exists about text not null default '',
  add column if not exists city text not null default '',
  add column if not exists contact_name text not null default '',
  add column if not exists contact_email text not null default '',
  add column if not exists size_band text not null default '';

alter table events
  add column if not exists join_code_hash text unique,
  add column if not exists promo text not null default '';

create index if not exists events_join_code_hash_idx on events (join_code_hash);

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table event_posts enable row level security;

drop policy if exists "org members read org" on organizations;
create policy "org members read org" on organizations for select
  using (exists (select 1 from org_members m where m.org_id = id and m.user_id = auth.uid()));

drop policy if exists "org members read membership" on org_members;
create policy "org members read membership" on org_members for select
  using (user_id = auth.uid() or exists (
    select 1 from org_members m where m.org_id = org_members.org_id and m.user_id = auth.uid()));

drop policy if exists "registered read event posts" on event_posts;
create policy "registered read event posts" on event_posts for select
  using (
    exists (select 1 from event_registrations r where r.event_id = event_posts.event_id and r.user_id = auth.uid())
    or exists (
      select 1 from events e join org_members m on m.org_id = e.org_id
      where e.id = event_posts.event_id and m.user_id = auth.uid())
  );
