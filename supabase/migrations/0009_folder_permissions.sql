-- Family Plan — Ship 1c: per-folder member permissions
--
-- Adds:
--   1. folders.share_mode ∈ {'all', 'select'} — default 'all' preserves Ship 1b
--      behavior where every household member can see every shared folder.
--   2. folder_member_permissions table — per-(folder, user) overrides for
--      can_read and can_write. Absent row = default per share_mode.
--   3. RLS rewrites on folders + items that honor the permissions.
--
-- Semantics:
--   share_mode='all'    → all household members can read/write.
--                          A permissions row downgrades that user (e.g.
--                          can_write=false makes them read-only).
--   share_mode='select' → only users with a permissions row can see the folder.
--                          Their row's can_read/can_write determines their access.
--
-- Run in Supabase SQL Editor after 0008.

-- ===========================================================================
-- folders.share_mode
-- ===========================================================================

alter table folders add column share_mode text not null default 'all'
  check (share_mode in ('all', 'select'));

-- ===========================================================================
-- folder_member_permissions
-- ===========================================================================

create table folder_member_permissions (
  folder_id uuid not null references folders(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_read boolean not null default true,
  can_write boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);

create index folder_member_permissions_user_idx on folder_member_permissions(user_id);

create trigger folder_member_permissions_set_updated_at
  before update on folder_member_permissions
  for each row execute function set_updated_at();

alter table folder_member_permissions enable row level security;

-- Only the folder owner can manage permissions.
create policy "folder_permissions_owner_all" on folder_member_permissions
  for all to authenticated
  using (
    exists (select 1 from folders where client_id = folder_member_permissions.folder_id and user_id = auth.uid())
  )
  with check (
    exists (select 1 from folders where client_id = folder_member_permissions.folder_id and user_id = auth.uid())
  );

-- Members can read their own permission row (so the client knows it's
-- read-only and can grey out the edit UI).
create policy "folder_permissions_self_read" on folder_member_permissions
  for select to authenticated
  using (user_id = auth.uid());

-- ===========================================================================
-- Helper function — evaluates folder access for a user
-- ===========================================================================

create or replace function folder_can_read(folder_client_id uuid, uid uuid) returns boolean as $$
  select case
    when f.user_id = uid then true
    when f.household_id is null then false
    when not exists (select 1 from household_members where household_id = f.household_id and user_id = uid) then false
    when f.share_mode = 'all' then
      not exists (
        select 1 from folder_member_permissions p
        where p.folder_id = f.client_id and p.user_id = uid and p.can_read = false
      )
    when f.share_mode = 'select' then
      exists (
        select 1 from folder_member_permissions p
        where p.folder_id = f.client_id and p.user_id = uid and p.can_read = true
      )
    else false
  end
  from folders f
  where f.client_id = folder_client_id;
$$ language sql stable security invoker;

create or replace function folder_can_write(folder_client_id uuid, uid uuid) returns boolean as $$
  select case
    when f.user_id = uid then true
    when f.household_id is null then false
    when not exists (select 1 from household_members where household_id = f.household_id and user_id = uid) then false
    when f.share_mode = 'all' then
      coalesce(
        (select can_write from folder_member_permissions p
          where p.folder_id = f.client_id and p.user_id = uid limit 1),
        true
      )
    when f.share_mode = 'select' then
      coalesce(
        (select can_write from folder_member_permissions p
          where p.folder_id = f.client_id and p.user_id = uid limit 1),
        false
      )
    else false
  end
  from folders f
  where f.client_id = folder_client_id;
$$ language sql stable security invoker;

-- ===========================================================================
-- Rewrite folders RLS to use the helpers
-- ===========================================================================

drop policy if exists "folders_visible"        on folders;
drop policy if exists "folders_insert_self"    on folders;
drop policy if exists "folders_update_member"  on folders;
drop policy if exists "folders_delete_member"  on folders;

create policy "folders_visible" on folders
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and (
        share_mode = 'all'
        and not exists (
          select 1 from folder_member_permissions p
          where p.folder_id = folders.client_id and p.user_id = auth.uid() and p.can_read = false
        )
        and household_id in (select household_id from household_members where user_id = auth.uid())
      )
      or (
        household_id is not null
        and share_mode = 'select'
        and exists (
          select 1 from folder_member_permissions p
          where p.folder_id = folders.client_id and p.user_id = auth.uid() and p.can_read = true
        )
        and household_id in (select household_id from household_members where user_id = auth.uid())
      )
    )
  );

create policy "folders_insert_self" on folders
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or household_id in (select household_id from household_members where user_id = auth.uid()))
  );

create policy "folders_update_member" on folders
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and folder_can_write(client_id, auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and folder_can_write(client_id, auth.uid()))
  );

create policy "folders_delete_member" on folders
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and folder_can_write(client_id, auth.uid()))
  );

-- ===========================================================================
-- Rewrite items RLS — items inherit their folder's permission
-- ===========================================================================

drop policy if exists "items_visible"        on items;
drop policy if exists "items_insert_self"    on items;
drop policy if exists "items_update_member"  on items;
drop policy if exists "items_delete_member"  on items;

create policy "items_visible" on items
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and household_id in (select household_id from household_members where user_id = auth.uid())
      and (
        -- Item has no folder → all household members can see it (Ship 1a default)
        folder_id is null
        or folder_can_read(folder_id, auth.uid())
      )
    )
  );

create policy "items_insert_self" on items
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      household_id is null
      or (
        household_id in (select household_id from household_members where user_id = auth.uid())
        and (folder_id is null or folder_can_write(folder_id, auth.uid()))
      )
    )
  );

create policy "items_update_member" on items
  for update to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and household_id in (select household_id from household_members where user_id = auth.uid())
      and (folder_id is null or folder_can_write(folder_id, auth.uid()))
    )
  )
  with check (
    user_id = auth.uid()
    or (
      household_id is not null
      and household_id in (select household_id from household_members where user_id = auth.uid())
      and (folder_id is null or folder_can_write(folder_id, auth.uid()))
    )
  );

create policy "items_delete_member" on items
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and household_id in (select household_id from household_members where user_id = auth.uid())
      and (folder_id is null or folder_can_write(folder_id, auth.uid()))
    )
  );
