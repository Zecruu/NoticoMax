-- Household / family accounts.
-- A household is a group of users who share items, folders, and a budget.
-- Each user can belong to 0..N households. Items/budget rows keep a single
-- user_id (the creator) plus an optional household_id; when household_id is
-- set, every member of that household can read and write the row.

-- ===========================================================================
-- households
-- ===========================================================================

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on households
  for each row execute function set_updated_at();

alter table households enable row level security;

create policy "households_member_read" on households
  for select to authenticated
  using (id in (select household_id from household_members where user_id = auth.uid()));

create policy "households_owner_insert" on households
  for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "households_owner_update" on households
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "households_owner_delete" on households
  for delete to authenticated
  using (owner_user_id = auth.uid());

-- ===========================================================================
-- household_members
-- ===========================================================================

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on household_members(user_id);

alter table household_members enable row level security;

create policy "household_members_self_or_member_read" on household_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or household_id in (select household_id from household_members hm where hm.user_id = auth.uid())
  );

-- Inserts only happen via the server (service role) on accept-invite.
-- Members can leave (delete their own row); owners can remove anyone.
create policy "household_members_delete_self_or_owner" on household_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or household_id in (select id from households where owner_user_id = auth.uid())
  );

-- ===========================================================================
-- household_invites
-- ===========================================================================

create table household_invites (
  token uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  invited_email text not null,
  -- Resolved on server-side insert when the email matches an existing user.
  -- Null when the invitee doesn't have an account yet (v1: we surface an
  -- error rather than emailing a magic link; that's Ship 3 polish).
  invited_user_id uuid references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index household_invites_invitee_pending_idx on household_invites(invited_user_id) where status = 'pending';
create index household_invites_household_idx on household_invites(household_id);

alter table household_invites enable row level security;

create policy "household_invites_visible_to_party" on household_invites
  for select to authenticated
  using (
    invited_by = auth.uid()
    or invited_user_id = auth.uid()
    or household_id in (select household_id from household_members where user_id = auth.uid())
  );

create policy "household_invites_create_by_member" on household_invites
  for insert to authenticated
  with check (
    invited_by = auth.uid()
    and household_id in (select household_id from household_members where user_id = auth.uid())
  );

-- Either party can update (accept/decline/revoke). Server-side endpoint also
-- updates with service role for atomicity.
create policy "household_invites_update_by_party" on household_invites
  for update to authenticated
  using (invited_by = auth.uid() or invited_user_id = auth.uid())
  with check (invited_by = auth.uid() or invited_user_id = auth.uid());

-- ===========================================================================
-- Add household_id columns to existing tables
-- ===========================================================================

alter table items                       add column household_id uuid references households(id) on delete set null;
alter table folders                     add column household_id uuid references households(id) on delete set null;
alter table budget_categories           add column household_id uuid references households(id) on delete set null;
alter table budget_transactions         add column household_id uuid references households(id) on delete set null;
alter table budget_category_overrides   add column household_id uuid references households(id) on delete set null;

create index items_household_idx                     on items(household_id)                     where household_id is not null;
create index folders_household_idx                   on folders(household_id)                   where household_id is not null;
create index budget_categories_household_idx         on budget_categories(household_id)         where household_id is not null;
create index budget_transactions_household_idx       on budget_transactions(household_id)       where household_id is not null;
create index budget_category_overrides_household_idx on budget_category_overrides(household_id) where household_id is not null;

-- ===========================================================================
-- RLS rewrites: visible if you own it OR you're in its household.
-- Writable on the same condition; insert still requires user_id = auth.uid().
-- ===========================================================================

-- ITEMS
drop policy if exists "items_owner_read"   on items;
drop policy if exists "items_owner_insert" on items;
drop policy if exists "items_owner_update" on items;
drop policy if exists "items_owner_delete" on items;

create policy "items_visible" on items
  for select to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "items_insert_self" on items
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "items_update_member" on items
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "items_delete_member" on items
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );

-- FOLDERS
drop policy if exists "folders_owner_read"   on folders;
drop policy if exists "folders_owner_insert" on folders;
drop policy if exists "folders_owner_update" on folders;
drop policy if exists "folders_owner_delete" on folders;

create policy "folders_visible" on folders
  for select to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
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
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "folders_delete_member" on folders
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );

-- BUDGET_CATEGORIES
drop policy if exists "budget_categories_owner_read"   on budget_categories;
drop policy if exists "budget_categories_owner_insert" on budget_categories;
drop policy if exists "budget_categories_owner_update" on budget_categories;
drop policy if exists "budget_categories_owner_delete" on budget_categories;

create policy "budget_categories_visible" on budget_categories
  for select to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_categories_insert_self" on budget_categories
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_categories_update_member" on budget_categories
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_categories_delete_member" on budget_categories
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );

-- BUDGET_TRANSACTIONS
drop policy if exists "budget_transactions_owner_read"   on budget_transactions;
drop policy if exists "budget_transactions_owner_insert" on budget_transactions;
drop policy if exists "budget_transactions_owner_update" on budget_transactions;
drop policy if exists "budget_transactions_owner_delete" on budget_transactions;

create policy "budget_transactions_visible" on budget_transactions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_transactions_insert_self" on budget_transactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_transactions_update_member" on budget_transactions
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_transactions_delete_member" on budget_transactions
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );

-- BUDGET_CATEGORY_OVERRIDES
drop policy if exists "budget_category_overrides_owner_read"   on budget_category_overrides;
drop policy if exists "budget_category_overrides_owner_insert" on budget_category_overrides;
drop policy if exists "budget_category_overrides_owner_update" on budget_category_overrides;
drop policy if exists "budget_category_overrides_owner_delete" on budget_category_overrides;

create policy "budget_category_overrides_visible" on budget_category_overrides
  for select to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_category_overrides_insert_self" on budget_category_overrides
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_category_overrides_update_member" on budget_category_overrides
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );
create policy "budget_category_overrides_delete_member" on budget_category_overrides
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select household_id from household_members where user_id = auth.uid()))
  );

-- ===========================================================================
-- Realtime publication
-- ===========================================================================

alter table households         replica identity full;
alter table household_members  replica identity full;
alter table household_invites  replica identity full;

alter publication supabase_realtime add table households;
alter publication supabase_realtime add table household_members;
alter publication supabase_realtime add table household_invites;
