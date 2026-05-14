-- Budget sync — categories, transactions, and per-user monthly income.
-- Mirrors the items/folders/locations pattern: client_id primary key, owner RLS,
-- updated_at trigger, full replica identity, realtime publication.

-- ===========================================================================
-- budget_categories
-- ===========================================================================

create table budget_categories (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#10B981',
  monthly_limit numeric(12, 2) not null default 0,
  device_id text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index budget_categories_user_idx on budget_categories(user_id);
create index budget_categories_user_active_idx on budget_categories(user_id) where deleted = false;
create index budget_categories_user_updated_idx on budget_categories(user_id, updated_at desc);

create trigger budget_categories_set_updated_at
  before update on budget_categories
  for each row execute function set_updated_at();

alter table budget_categories enable row level security;

create policy "budget_categories_owner_read" on budget_categories
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "budget_categories_owner_insert" on budget_categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "budget_categories_owner_update" on budget_categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "budget_categories_owner_delete" on budget_categories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- budget_transactions
-- ===========================================================================

create table budget_transactions (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- category_id references the category's client_id (which is what local code uses)
  category_id uuid not null,
  amount numeric(12, 2) not null,
  note text,
  -- date is the user-facing day the spend happened (separate from created_at)
  date timestamptz not null default now(),
  device_id text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index budget_transactions_user_idx on budget_transactions(user_id);
create index budget_transactions_category_idx on budget_transactions(category_id);
create index budget_transactions_user_date_idx on budget_transactions(user_id, date desc);
create index budget_transactions_user_updated_idx on budget_transactions(user_id, updated_at desc);

create trigger budget_transactions_set_updated_at
  before update on budget_transactions
  for each row execute function set_updated_at();

alter table budget_transactions enable row level security;

create policy "budget_transactions_owner_read" on budget_transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "budget_transactions_owner_insert" on budget_transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "budget_transactions_owner_update" on budget_transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "budget_transactions_owner_delete" on budget_transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- budget_settings — singleton per user (monthly income lives here)
-- ===========================================================================

create table budget_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

create trigger budget_settings_set_updated_at
  before update on budget_settings
  for each row execute function set_updated_at();

alter table budget_settings enable row level security;

create policy "budget_settings_owner_read" on budget_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "budget_settings_owner_insert" on budget_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "budget_settings_owner_update" on budget_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ===========================================================================
-- Realtime publication
-- ===========================================================================

alter table budget_categories replica identity full;
alter table budget_transactions replica identity full;
alter table budget_settings replica identity full;

alter publication supabase_realtime add table budget_categories;
alter publication supabase_realtime add table budget_transactions;
alter publication supabase_realtime add table budget_settings;
