-- AD10: Expo push tokens. A separate owner-only table, not a profiles column, because any
-- authenticated user can read profile rows. The ML service (service key) reads it to send pushes.
create table push_tokens (
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null,                  -- ExponentPushToken[...]
  platform text check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table push_tokens enable row level security;
create policy "push_tokens: owner read" on push_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy "push_tokens: owner insert" on push_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "push_tokens: owner update" on push_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_tokens: owner delete" on push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));
