-- HackGT 13 demo event (times are placeholders from docs/schema.sql; fix to the real schedule).
-- TODO(MASTER_SPEC): add event_zones rows once the spec lists the zones.
insert into events (name, venue, starts_at, ends_at)
select 'HackGT 13', 'Georgia Tech', '2026-09-25 18:00-04', '2026-09-27 14:00-04'
where not exists (select 1 from events where name = 'HackGT 13');
