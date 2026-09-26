-- MASTER_SPEC 8.3: row-level security for the Section 8.2 tables, plus Realtime.
-- Tables not named in 8.3 default to no client access (RLS on, zero policies), except where noted.

-- Helper: is the caller a participant in a matched suggestion? security definer because
-- suggestions itself has no client access.
create or replace function public.is_matched_suggestion_participant(sid bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.suggestions s
    where s.id = sid and s.status = 'matched'
      and (select auth.uid()) in (s.user_a, s.user_b)
  );
$$;
revoke execute on function public.is_matched_suggestion_participant(bigint) from public, anon;
grant execute on function public.is_matched_suggestion_participant(bigint) to authenticated;

-- chats, messages: readable and insertable only by the two participants
alter table chats enable row level security;
create policy "chats: participants read" on chats for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy "chats: participants insert" on chats for insert to authenticated
  with check ((select auth.uid()) in (user_a, user_b));

alter table messages enable row level security;
create policy "messages: participants read" on messages for select to authenticated
  using (exists (select 1 from chats c where c.id = chat_id and (select auth.uid()) in (c.user_a, c.user_b)));
create policy "messages: participants insert" on messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from chats c where c.id = chat_id and (select auth.uid()) in (c.user_a, c.user_b))
  );

-- location_shares: readable only by the other participant; writable only by its owner
alter table location_shares enable row level security;
create policy "location_shares: other participant reads" on location_shares for select to authenticated
  using (user_id <> (select auth.uid()) and public.is_matched_suggestion_participant(suggestion_id));
create policy "location_shares: owner insert" on location_shares for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_matched_suggestion_participant(suggestion_id));
create policy "location_shares: owner update" on location_shares for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "location_shares: owner delete" on location_shares for delete to authenticated
  using (user_id = (select auth.uid()));

-- feed_items: readable by the author and the author's connections
alter table feed_items enable row level security;
create policy "feed_items: author and connections read" on feed_items for select to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from connections k
      where (k.user_a = author_id and k.user_b = (select auth.uid()))
         or (k.user_b = author_id and k.user_a = (select auth.uid()))
    )
  );
create policy "feed_items: author writes" on feed_items for all to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

-- invites, notifications, web_mentions, feed_prefs: owner only
alter table invites enable row level security;
create policy "invites: owner" on invites for all to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

alter table notifications enable row level security;
create policy "notifications: owner read" on notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications: owner mark read" on notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table web_mentions enable row level security;
create policy "web_mentions: owner" on web_mentions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table feed_prefs enable row level security;
create policy "feed_prefs: owner" on feed_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- suggestions, conversations: no client access (FastAPI only).
-- sightings, encounters, impressions already have RLS on with no policies.
alter table suggestions enable row level security;
alter table conversations enable row level security;

-- Not named in 8.3. event_registrations: owner only. Organizations and event_posts go through
-- FastAPI until their screens need direct access.
alter table event_registrations enable row level security;
create policy "event_registrations: owner" on event_registrations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table org_subscriptions enable row level security;
alter table event_posts enable row level security;

-- Realtime streams (RLS still applies to what streams)
alter publication supabase_realtime add table messages, location_shares, notifications;
