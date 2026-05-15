-- Goal sync — single goals table, scope-keyed by period (today / month / year).

create table goals (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  scope text not null check (scope in ('today', 'month', 'year')),
  period_key text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  device_id text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_user_idx on goals(user_id);
create index goals_user_period_idx on goals(user_id, scope, period_key);
create index goals_user_updated_idx on goals(user_id, updated_at desc);
create index goals_user_active_idx on goals(user_id) where deleted = false;

create trigger goals_set_updated_at
  before update on goals
  for each row execute function set_updated_at();

alter table goals enable row level security;

create policy "goals_owner_read" on goals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals_owner_insert" on goals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals_owner_update" on goals
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals_owner_delete" on goals
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table goals replica identity full;
alter publication supabase_realtime add table goals;
