-- NoticoMax initial Supabase schema
-- Run this in the Supabase SQL Editor (or via supabase db push) on a fresh project.
-- Replaces the previous Mongoose models in src/models/*.

-- ===========================================================================
-- Helpers
-- ===========================================================================

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ===========================================================================
-- legacy_auth — PBKDF2 password hashes for users migrated from MongoDB.
-- On first successful login, the API verifies against this row, calls
-- supabase.auth.admin.updateUserById(...) to upgrade to bcrypt, then deletes
-- the row. Empty for users created natively in Supabase Auth.
-- ===========================================================================

create table legacy_auth (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash text not null,
  salt text not null,
  created_at timestamptz not null default now()
);

alter table legacy_auth enable row level security;
-- Service-role only (no policies = no access for anon/authenticated).

-- ===========================================================================
-- entitlements — per-user pro/lifetime status + Apple linkage.
-- ===========================================================================

create table entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lifetime_pro boolean not null default false,
  pro_expires_at timestamptz,
  pro_source text check (pro_source in ('lifetime', 'license_key', 'apple_iap', 'stripe')),
  apple_user_id text unique,
  updated_at timestamptz not null default now()
);

create trigger entitlements_set_updated_at
  before update on entitlements
  for each row execute function set_updated_at();

alter table entitlements enable row level security;

create policy "entitlements_owner_read" on entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Writes are service-role only (paid tier upgrades happen server-side).

-- ===========================================================================
-- licenses — legacy product keys (NMAX-XXXX-XXXX-XXXX format from Gumroad era)
-- ===========================================================================

create table licenses (
  license_key text primary key,
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  source text,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index licenses_user_idx on licenses(user_id);

alter table licenses enable row level security;

create policy "licenses_owner_read" on licenses
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- folders
-- ===========================================================================

create table folders (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index folders_user_idx on folders(user_id);
create index folders_user_active_idx on folders(user_id) where deleted = false;

create trigger folders_set_updated_at
  before update on folders
  for each row execute function set_updated_at();

alter table folders enable row level security;

create policy "folders_owner_read" on folders
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "folders_owner_insert" on folders
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "folders_owner_update" on folders
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "folders_owner_delete" on folders
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- items — notes, urls, reminders, envvars, credentials
-- ===========================================================================

create table items (
  client_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('note', 'url', 'reminder', 'envvar', 'credential')),
  title text not null,
  content text not null default '',
  url text,
  reminder_date timestamptz,
  reminder_completed boolean,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  color text,
  folder_id uuid references folders(client_id) on delete set null,
  device_id text,
  deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_idx on items(user_id);
create index items_user_type_idx on items(user_id, type);
create index items_folder_idx on items(folder_id) where folder_id is not null;
create index items_tags_gin on items using gin (tags);
create index items_user_updated_idx on items(user_id, updated_at desc);
create index items_user_active_idx on items(user_id) where deleted = false;

create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

alter table items enable row level security;

create policy "items_owner_read" on items
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "items_owner_insert" on items
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "items_owner_update" on items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "items_owner_delete" on items
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- claude_resumes — internal Claude handoff log (admin-only, no per-user RLS)
-- ===========================================================================

create table claude_resumes (
  number bigint primary key generated always as identity,
  author text not null,
  content text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claude_resumes_created_idx on claude_resumes(created_at desc);

create trigger claude_resumes_set_updated_at
  before update on claude_resumes
  for each row execute function set_updated_at();

alter table claude_resumes enable row level security;
-- Service-role only.

-- ===========================================================================
-- Realtime publication — enable change-streaming for sync
-- ===========================================================================

-- Required for filtering subscriptions by columns other than the PK
alter table items replica identity full;
alter table folders replica identity full;

-- Add to the realtime publication (created automatically by Supabase)
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table folders;
