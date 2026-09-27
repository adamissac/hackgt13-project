-- AD1 checks against a database built from supabase/migrations/. Raises on the first failure.
\set ON_ERROR_STOP 1

-- Structure
do $$
declare missing text;
begin
  select string_agg(relname, ', ') into missing from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'RLS off on: %', missing; end if;
  if not exists (select 1 from events where name = 'HackGT 13') then raise exception 'HackGT 13 seed event missing'; end if;
  if (select count(*) from pg_publication_tables where pubname = 'supabase_realtime'
      and tablename in ('messages', 'location_shares', 'notifications')) <> 3 then
    raise exception 'realtime publication incomplete';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'profile_vectors_idx' and indexdef ilike '%hnsw%vector_cosine_ops%') then
    raise exception 'HNSW cosine index on profile_vectors missing';
  end if;
  if (select public from storage.buckets where id = 'resumes') is distinct from false then
    raise exception 'resumes bucket missing or public';
  end if;
end $$;

-- Fixtures (as superuser). A is the viewer; B and C are other people.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"name":"A","picture":"https://x/a.png"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{"name":"B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"name":"C"}');

do $$ begin
  if (select count(*) from profiles) <> 3 then raise exception 'signup trigger did not create profiles'; end if;
  if (select photo_url from profiles where name = 'A') <> 'https://x/a.png' then raise exception 'trigger did not copy picture'; end if;
end $$;

insert into notifications (user_id, kind) values ('00000000-0000-0000-0000-00000000000b', 'suggestion');
insert into invites (sender_id, token_hash, expires_at) values ('00000000-0000-0000-0000-00000000000b', 'h', now() + interval '7 days');
insert into feed_prefs (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into web_mentions (user_id, url) values ('00000000-0000-0000-0000-00000000000b', 'https://example.com');
insert into connections (user_a, user_b) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
insert into chats (id, user_a, user_b, origin) values (900, '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'suggestion');
insert into messages (chat_id, sender_id, body) values (900, '00000000-0000-0000-0000-00000000000b', 'hi');
insert into suggestions (id, user_a, user_b, status) values (901, '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'matched');
insert into location_shares (suggestion_id, user_id, lat, lng, expires_at) values (901, '00000000-0000-0000-0000-00000000000b', 33.77, -84.39, now() + interval '30 minutes');
insert into location_shares (suggestion_id, user_id, lat, lng, expires_at) values (901, '00000000-0000-0000-0000-00000000000c', 33.78, -84.40, now() + interval '30 minutes');
insert into storage.objects (bucket_id, name) values ('resumes', '00000000-0000-0000-0000-00000000000b/resume.pdf');
insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-00000000000b', 'ExponentPushToken[b]', 'ios');

-- As user A: none of B's private rows are visible, and A can't write into B's chat.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare t text; n int;
begin
  foreach t in array array['notifications','invites','feed_prefs','web_mentions','connections','chats','messages',
                           'suggestions','location_shares','conversations','sightings','encounters','impressions',
                           'push_tokens'] loop
    execute format('select count(*) from %I', t) into n;
    if n <> 0 then raise exception 'user A can see % row(s) in %', n, t; end if;
  end loop;
  if (select count(*) from storage.objects) <> 0 then raise exception 'user A can see B''s resume'; end if;
  begin
    insert into messages (chat_id, sender_id, body) values (900, '00000000-0000-0000-0000-00000000000a', 'x');
    raise exception 'user A inserted into a chat they are not in';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into push_tokens (user_id, token) values ('00000000-0000-0000-0000-00000000000b', 'ExponentPushToken[a]');
    raise exception 'user A inserted a push token for B';
  exception when insufficient_privilege then null;
  end;
  update push_tokens set token = 'hijacked' where user_id = '00000000-0000-0000-0000-00000000000b';
  delete from push_tokens where user_id = '00000000-0000-0000-0000-00000000000b';
  insert into push_tokens (user_id, token, platform) values ('00000000-0000-0000-0000-00000000000a', 'ExponentPushToken[a]', 'android');
end $$;

-- As user C (B's chat partner and match): after C also opts in, sees B's meetup location, not B's notifications.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  if (select count(*) from messages) <> 1 then raise exception 'participant C cannot read the chat'; end if;
  if (select count(*) from location_shares) <> 1 then raise exception 'reciprocally sharing participant C cannot read B''s location'; end if;
  if (select count(*) from notifications) <> 0 then raise exception 'C can see B''s notifications'; end if;
end $$;

-- As user B: owner-only rows are readable by their owner.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  if (select count(*) from notifications) <> 1 then raise exception 'B cannot read own notifications'; end if;
  if (select count(*) from storage.objects) <> 1 then raise exception 'B cannot read own resume'; end if;
  if (select token from push_tokens) is distinct from 'ExponentPushToken[b]' then
    raise exception 'B''s push token missing or altered by A';
  end if;
end $$;
reset role;

-- Deleting a profile (what DELETE /me does) removes that user's push tokens.
delete from profiles where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if exists (select 1 from push_tokens where user_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'push_tokens did not cascade from profiles';
  end if;
end $$;

select 'ALL AD1 CHECKS PASSED';
