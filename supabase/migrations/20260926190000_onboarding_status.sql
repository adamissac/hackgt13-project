-- Onboarding (post-signup): pending = hasn't seen onboarding, partial = skipped or added a source that
-- hasn't produced a profile yet, complete = the profile builder has stored interests at least once.
alter table profiles
  add column if not exists onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'partial', 'complete'));

-- Existing people who already have interests are done (includes seeded demo attendees).
update profiles p set onboarding_status = 'complete'
where exists (select 1 from user_interests ui where ui.user_id = p.id);

-- The profile builder writes user_interests with the service key; the first row marks onboarding complete.
create or replace function public.mark_onboarding_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set onboarding_status = 'complete'
  where id = new.user_id and onboarding_status <> 'complete';
  return new;
end;
$$;

drop trigger if exists on_user_interest_added on public.user_interests;
create trigger on_user_interest_added
  after insert on public.user_interests
  for each row execute function public.mark_onboarding_complete();
