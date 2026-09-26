-- RLS on every public table the base schema left open.
-- Default is "no client access": RLS on, zero policies (the FastAPI service uses the service key).
-- TODO(MASTER_SPEC 8.3): add client policies the spec calls for once the spec is in the repo.
alter table raw_documents  enable row level security;
alter table interests      enable row level security;
alter table profile_vectors enable row level security;
alter table events         enable row level security;
alter table event_zones    enable row level security;
alter table attendance     enable row level security;
alter table device_keys    enable row level security;
alter table ephemeral_ids  enable row level security;
alter table encounters     enable row level security;
alter table handshakes     enable row level security;
alter table chat_invites   enable row level security;

-- The app lists events and their zones.
create policy "read events" on events for select to authenticated using (true);
create policy "read event zones" on event_zones for select to authenticated using (true);
