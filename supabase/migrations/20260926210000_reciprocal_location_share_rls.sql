-- Exact meetup coordinates are visible only after each participant has an active share.
-- The security-definer helper avoids a recursive RLS lookup on location_shares.
create or replace function public.has_active_location_share(p_suggestion_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.location_shares
    where suggestion_id = p_suggestion_id
      and user_id = auth.uid()
      and expires_at > now()
  );
$$;

revoke all on function public.has_active_location_share(bigint) from public;
grant execute on function public.has_active_location_share(bigint) to authenticated;

drop policy "location_shares: other participant reads" on public.location_shares;
create policy "location_shares: reciprocal participant reads"
  on public.location_shares for select to authenticated
  using (
    user_id <> auth.uid()
    and public.is_matched_suggestion_participant(suggestion_id)
    and public.has_active_location_share(suggestion_id)
  );
