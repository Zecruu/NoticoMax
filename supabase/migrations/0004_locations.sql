-- locations — saved geographic points (favorite spots, current location snapshots, etc.)
-- Cloud-synced alongside items/folders for licensed users.

create table locations (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  notes text,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  color text,
  device_id text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_user_idx on locations(user_id);
create index locations_user_updated_idx on locations(user_id, updated_at desc);
create index locations_user_active_idx on locations(user_id) where deleted = false;
create index locations_tags_gin on locations using gin (tags);

create trigger locations_set_updated_at
  before update on locations
  for each row execute function set_updated_at();

alter table locations enable row level security;

create policy "locations_owner_read" on locations
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "locations_owner_insert" on locations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "locations_owner_update" on locations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "locations_owner_delete" on locations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table locations replica identity full;
alter publication supabase_realtime add table locations;
