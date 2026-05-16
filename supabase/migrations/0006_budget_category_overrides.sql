-- Per-month limit overrides for budget categories.
-- The base monthly_limit on budget_categories is the "default" that applies
-- every month. An override row pins a different limit for a specific
-- (category, month) — e.g. "rent is $1800 in July" while the default is $1500.

create table budget_category_overrides (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- References budget_categories.client_id. Not a hard FK because the
  -- category_id on transactions also points at client_id and isn't enforced;
  -- staying consistent with that.
  category_id uuid not null,
  -- "YYYY-MM" — keeps the join with viewMonthKey trivial on the client.
  month_key text not null,
  monthly_limit numeric(12, 2) not null,
  device_id text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month_key)
);

create index budget_category_overrides_user_idx on budget_category_overrides(user_id);
create index budget_category_overrides_user_month_idx on budget_category_overrides(user_id, month_key);
create index budget_category_overrides_user_updated_idx on budget_category_overrides(user_id, updated_at desc);

create trigger budget_category_overrides_set_updated_at
  before update on budget_category_overrides
  for each row execute function set_updated_at();

alter table budget_category_overrides enable row level security;

create policy "budget_category_overrides_owner_read" on budget_category_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "budget_category_overrides_owner_insert" on budget_category_overrides
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "budget_category_overrides_owner_update" on budget_category_overrides
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "budget_category_overrides_owner_delete" on budget_category_overrides
  for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table budget_category_overrides replica identity full;
alter publication supabase_realtime add table budget_category_overrides;
