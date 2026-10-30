-- Family foundation. Apply only after the existing migrations, in a reviewed
-- staging rollout first. No paid personal-sync/billing entitlement is changed.
begin;

-- Saved places are NOT check-ins. Keep their existing owner-only RLS; adding
-- this column repairs the previously shipped client/schema mismatch only.
alter table public.locations add column if not exists household_id uuid references public.households(id) on delete set null;

-- Bound helpers bypass policy recursion, not authorization. Do not accept an
-- arbitrary caller-supplied identity; folder helpers retain their old signature.
create or replace function public.family_is_member(p_household_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.user_id = auth.uid()
  );
$$;
create or replace function public.family_is_owner(p_household_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.households h
    where h.id = p_household_id and h.owner_user_id = auth.uid()
  );
$$;
create or replace function public.folder_can_read(folder_client_id uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select uid = auth.uid() and case
    when f.household_id is null then f.user_id = uid
    when not public.family_is_member(f.household_id) then false
    when f.user_id = uid then true
    when f.share_mode = 'all' then coalesce(p.can_read, true)
    else coalesce(p.can_read, false)
  end from public.folders f left join public.folder_member_permissions p
    on p.folder_id = f.client_id and p.user_id = uid
  where f.client_id = folder_client_id), false);
$$;
create or replace function public.folder_can_write(folder_client_id uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select uid = auth.uid() and case
    when f.household_id is null then f.user_id = uid
    when not public.family_is_member(f.household_id) then false
    when f.user_id = uid then true
    when f.share_mode = 'all' then coalesce(p.can_read and p.can_write, true)
    else coalesce(p.can_read and p.can_write, false)
  end from public.folders f left join public.folder_member_permissions p
    on p.folder_id = f.client_id and p.user_id = uid
  where f.client_id = folder_client_id), false);
$$;

revoke all on function public.family_is_member(uuid), public.family_is_owner(uuid), public.folder_can_read(uuid, uuid), public.folder_can_write(uuid, uuid) from public, anon;
grant execute on function public.family_is_member(uuid), public.family_is_owner(uuid), public.folder_can_read(uuid, uuid), public.folder_can_write(uuid, uuid) to authenticated, service_role;

drop policy if exists household_members_self_or_member_read on public.household_members;
create policy household_members_self_or_member_read on public.household_members
for select to authenticated using (public.family_is_member(household_id));
drop policy if exists household_members_delete_self_or_owner on public.household_members;
create policy household_members_delete_self_or_owner on public.household_members
for delete to authenticated using (
  role <> 'owner' and (user_id = auth.uid() or public.family_is_owner(household_id))
);
drop policy if exists households_member_read on public.households;
create policy households_member_read on public.households
for select to authenticated using (public.family_is_member(id));
-- Only the RPC may create families: a direct insert would evade free limits
-- and leave a family without its owner membership or shared folder.
drop policy if exists households_owner_insert on public.households;

-- Invites and requests must be accepted through the checked, atomic RPCs.
-- A pending request is not membership or consent.
drop policy if exists household_invites_create_by_member on public.household_invites;
drop policy if exists household_invites_self_request on public.household_invites;
drop policy if exists household_invites_update_by_party on public.household_invites;
drop policy if exists household_invites_visible_to_party on public.household_invites;
create policy household_invites_visible_to_party on public.household_invites
for select to authenticated using (
  invited_user_id = auth.uid() or invited_by = auth.uid() or public.family_is_owner(household_id)
);

-- Permission administration belongs to the folder creator while still a
-- member, and cannot grant access to someone outside the accepted household.
drop policy if exists folder_permissions_owner_all on public.folder_member_permissions;
create policy folder_permissions_owner_all on public.folder_member_permissions
for all to authenticated using (
  exists (select 1 from public.folders f where f.client_id = folder_id
    and f.user_id = auth.uid() and public.family_is_member(f.household_id))
) with check (
  exists (select 1 from public.folders f join public.household_members m
    on m.household_id = f.household_id and m.user_id = folder_member_permissions.user_id
    where f.client_id = folder_id and f.user_id = auth.uid()
      and public.family_is_member(f.household_id))
);

drop policy if exists folders_visible on public.folders;
drop policy if exists folders_insert_self on public.folders;
drop policy if exists folders_update_member on public.folders;
drop policy if exists folders_delete_member on public.folders;
create policy folders_visible on public.folders for select to authenticated
using (public.folder_can_read(client_id, auth.uid()));
create policy folders_insert_self on public.folders for insert to authenticated
with check (user_id = auth.uid() and (household_id is null or public.family_is_member(household_id)));
create policy folders_update_member on public.folders for update to authenticated
using (public.folder_can_write(client_id, auth.uid()))
with check ((household_id is null and user_id = auth.uid()) or public.family_is_member(household_id));
create policy folders_delete_member on public.folders for delete to authenticated
using (user_id = auth.uid() and (household_id is null or public.family_is_member(household_id)));

drop policy if exists items_visible on public.items;
drop policy if exists items_insert_self on public.items;
drop policy if exists items_update_member on public.items;
drop policy if exists items_delete_member on public.items;
create policy items_visible on public.items for select to authenticated using (
  (household_id is null and user_id = auth.uid()) or
  (public.family_is_member(household_id) and (folder_id is null or public.folder_can_read(folder_id, auth.uid())))
);
create policy items_insert_self on public.items for insert to authenticated with check (
  user_id = auth.uid() and ((household_id is null) or
  (public.family_is_member(household_id) and (folder_id is null or public.folder_can_write(folder_id, auth.uid()))))
);
create policy items_update_member on public.items for update to authenticated using (
  (household_id is null and user_id = auth.uid()) or
  (public.family_is_member(household_id) and (folder_id is null or public.folder_can_write(folder_id, auth.uid())))
) with check (
  (household_id is null and user_id = auth.uid()) or
  (public.family_is_member(household_id) and (folder_id is null or public.folder_can_write(folder_id, auth.uid())))
);
create policy items_delete_member on public.items for delete to authenticated using (
  (household_id is null and user_id = auth.uid()) or
  (public.family_is_member(household_id) and (folder_id is null or public.folder_can_write(folder_id, auth.uid())))
);

-- Keep provenance stable. A collaborator cannot take ownership, make somebody
-- else's note private, or widen folder access. A creator may explicitly move
-- their own content, but it must satisfy membership and folder-scope rules.
create or replace function public.family_protect_content() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null then
    if new.user_id is distinct from old.user_id then
      raise exception 'family_creator_immutable' using errcode = '42501';
    end if;
    if new.household_id is distinct from old.household_id and old.user_id <> auth.uid() then
      raise exception 'family_scope_immutable' using errcode = '42501';
    end if;
    if tg_table_name = 'items' then
      if old.user_id <> auth.uid() and new.folder_id is distinct from old.folder_id then
        raise exception 'family_scope_immutable' using errcode = '42501';
      end if;
    end if;
    if tg_table_name = 'folders' and old.user_id <> auth.uid() then
      if new.share_mode is distinct from old.share_mode or new.deleted is distinct from old.deleted then
        raise exception 'family_owner_required' using errcode = '42501';
      end if;
    end if;
  end if;
  if tg_table_name = 'items' then
    if new.folder_id is not null then
    -- This runs as the writer; an inaccessible folder cannot be used as an
    -- oracle or as a way to smuggle a private item into another household.
    if not exists (select 1 from public.folders f where f.client_id = new.folder_id
      and f.household_id is not distinct from new.household_id
      and (new.household_id is not null or f.user_id = new.user_id)) then
      raise exception 'family_folder_scope_mismatch' using errcode = '23514';
    end if;
    end if;
  end if;
  if tg_table_name = 'folders' and tg_op = 'UPDATE'
    and new.household_id is distinct from old.household_id
    and exists (select 1 from public.items i where i.folder_id = old.client_id) then
    raise exception 'family_folder_not_empty' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger family_items_protect before insert or update on public.items
for each row execute function public.family_protect_content();
create trigger family_folders_protect before update on public.folders
for each row execute function public.family_protect_content();

-- Existing household owners can rename a family, but cannot grant themselves
-- paid seats or transfer authority through a direct authenticated table write.
create or replace function public.family_protect_household() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and (
    new.owner_user_id is distinct from old.owner_user_id or
    new.max_seats is distinct from old.max_seats or
    new.subscription_plan is distinct from old.subscription_plan or
    new.family_code is distinct from old.family_code
  ) then raise exception 'family_metadata_protected' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger family_household_protect before update on public.households
for each row execute function public.family_protect_household();

create table public.family_location_preferences (
  household_id uuid not null,
  user_id uuid not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  foreign key (household_id, user_id) references public.household_members(household_id, user_id) on delete cascade
);
create table public.family_checkins (
  household_id uuid not null,
  user_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision check (accuracy between 0 and 100000),
  captured_at timestamptz not null,
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (household_id, user_id),
  foreign key (household_id, user_id) references public.family_location_preferences(household_id, user_id) on delete cascade,
  check (expires_at = captured_at + interval '24 hours')
);
alter table public.family_location_preferences enable row level security;
alter table public.family_checkins enable row level security;
-- Writes are RPC-only to ensure consent and atomic revocation. Preferences
-- themselves are private, not an indicator others can pressure you about.
create policy family_location_preferences_self_read on public.family_location_preferences
for select to authenticated using (user_id = auth.uid() and public.family_is_member(household_id));
create policy family_checkins_member_read on public.family_checkins
for select to authenticated using (
  expires_at > now() and public.family_is_member(household_id)
);
grant select on public.family_location_preferences, public.family_checkins to authenticated;
revoke insert, update, delete on public.family_location_preferences, public.family_checkins from authenticated, anon;
grant all on public.family_location_preferences, public.family_checkins to service_role;

create or replace function public.set_family_location_sharing(p_household_id uuid, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'invalid_sharing_preference' using errcode = '22023'; end if;
  -- Membership lock serializes removal with consent/check-in creation.
  perform 1 from public.household_members where household_id = p_household_id and user_id = v_uid for update;
  if not found then raise exception 'family_membership_required' using errcode = '42501'; end if;
  insert into public.family_location_preferences(household_id,user_id,enabled)
    values(p_household_id,v_uid,p_enabled)
    on conflict (household_id,user_id) do update set enabled = excluded.enabled, updated_at = now();
  if not p_enabled then
    delete from public.family_checkins where household_id = p_household_id and user_id = v_uid;
  end if;
  return p_enabled;
end;
$$;

create or replace function public.share_family_checkin(
  p_household_id uuid, p_latitude double precision, p_longitude double precision,
  p_accuracy double precision, p_captured_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_checkin public.family_checkins;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform 1 from public.household_members where household_id = p_household_id and user_id = v_uid for update;
  if not found then raise exception 'family_membership_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.family_location_preferences where household_id = p_household_id and user_id = v_uid and enabled) then
    raise exception 'location_sharing_paused' using errcode = '42501';
  end if;
  if p_latitude is null or not (p_latitude between -90 and 90)
    or p_longitude is null or not (p_longitude between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy between 0 and 100000))
    or p_captured_at is null or p_captured_at < now() - interval '5 minutes'
    or p_captured_at > now() + interval '1 minute' then
    raise exception 'invalid_checkin' using errcode = '22023';
  end if;
  insert into public.family_checkins(household_id,user_id,latitude,longitude,accuracy,captured_at,shared_at,expires_at)
    values(p_household_id,v_uid,p_latitude,p_longitude,p_accuracy,p_captured_at,now(),p_captured_at + interval '24 hours')
    on conflict (household_id,user_id) do update set latitude = excluded.latitude,
      longitude = excluded.longitude, accuracy = excluded.accuracy, captured_at = excluded.captured_at,
      shared_at = excluded.shared_at, expires_at = excluded.expires_at
    returning * into v_checkin;
  return to_jsonb(v_checkin);
end;
$$;

create or replace function public.revoke_family_checkin(p_household_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  -- Revocation is idempotent and safe even if membership was concurrently removed.
  delete from public.family_checkins where household_id = p_household_id and user_id = auth.uid();
end;
$$;

create or replace function public.create_family_household(p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_household public.households; v_ent public.entitlements;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 60 then
    raise exception 'invalid_family_name' using errcode = '22023';
  end if;
  -- The user row always exists, unlike entitlements. Locking it prevents
  -- simultaneous requests from each creating a new free family.
  perform 1 from auth.users where id = v_uid for update;
  select * into v_ent from public.entitlements where user_id = v_uid;
  if not coalesce(v_ent.family_plan_active or v_ent.lifetime_pro, false)
    and exists (select 1 from public.households where owner_user_id = v_uid) then
    raise exception 'family_limit_reached' using errcode = '23514';
  end if;
  insert into public.households(name,owner_user_id,max_seats,subscription_plan)
    values(btrim(p_name),v_uid,5 + greatest(coalesce(v_ent.extra_seats,0),0),
      case when coalesce(v_ent.family_plan_active or v_ent.lifetime_pro,false) then 'family' else 'free' end)
    returning * into v_household;
  insert into public.household_members(household_id,user_id,role) values(v_household.id,v_uid,'owner');
  insert into public.folders(user_id,name,color,household_id,share_mode)
    values(v_uid,v_household.name,'#10B981',v_household.id,'all');
  return to_jsonb(v_household);
end;
$$;

-- Server-created email invitations require invitee consent; code requests
-- require owner approval. Lock family first, then invite, for all join paths.
create or replace function public.respond_family_invite(p_token uuid, p_action text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_invite public.household_invites; v_household public.households;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_action not in ('accept','decline') or p_action is null then raise exception 'invalid_invite_action' using errcode = '22023'; end if;
  select * into v_invite from public.household_invites where token = p_token;
  if not found then raise exception 'invite_not_found' using errcode = '22023'; end if;
  if v_invite.invited_user_id <> v_uid or v_invite.invited_user_id is null then raise exception 'invite_not_for_you' using errcode = '42501'; end if;
  select * into v_household from public.households where id = v_invite.household_id for update;
  if not found then raise exception 'family_not_found' using errcode = '22023'; end if;
  select * into v_invite from public.household_invites where token = p_token for update;
  if v_invite.status = 'accepted' and p_action = 'accept' and exists (
    select 1 from public.household_members where household_id = v_household.id and user_id = v_uid
  ) then return v_household.id; end if;
  if v_invite.status <> 'pending' then raise exception 'invite_already_responded' using errcode = '22023'; end if;
  if v_invite.expires_at <= now() then raise exception 'invite_expired' using errcode = '22023'; end if;
  if p_action = 'accept' and not exists (
    select 1 from public.household_members where household_id = v_household.id and user_id = v_uid
  ) then
    if (select count(*) from public.household_members where household_id = v_household.id) >= v_household.max_seats then
      raise exception 'family_seat_limit' using errcode = '23514';
    end if;
    insert into public.household_members(household_id,user_id,role) values(v_household.id,v_uid,'member');
  end if;
  update public.household_invites set status = case when p_action = 'accept' then 'accepted' else 'revoked' end,
    responded_at = now() where token = p_token;
  return v_household.id;
end;
$$;

create or replace function public.approve_family_request(p_token uuid, p_action text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_invite public.household_invites; v_household public.households;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_action not in ('approve','decline') or p_action is null then raise exception 'invalid_invite_action' using errcode = '22023'; end if;
  select * into v_invite from public.household_invites where token = p_token;
  if not found then raise exception 'invite_not_found' using errcode = '22023'; end if;
  select * into v_household from public.households where id = v_invite.household_id for update;
  if not found then raise exception 'family_not_found' using errcode = '22023'; end if;
  if v_household.owner_user_id <> v_uid then raise exception 'family_owner_required' using errcode = '42501'; end if;
  select * into v_invite from public.household_invites where token = p_token for update;
  if v_invite.status = 'accepted' and p_action = 'approve' and exists (
    select 1 from public.household_members where household_id = v_household.id and user_id = v_invite.invited_user_id
  ) then return v_household.id; end if;
  if v_invite.status <> 'requested' then raise exception 'invite_already_responded' using errcode = '22023'; end if;
  if v_invite.expires_at <= now() then raise exception 'invite_expired' using errcode = '22023'; end if;
  if p_action = 'approve' and not exists (
    select 1 from public.household_members where household_id = v_household.id and user_id = v_invite.invited_user_id
  ) then
    if (select count(*) from public.household_members where household_id = v_household.id) >= v_household.max_seats then
      raise exception 'family_seat_limit' using errcode = '23514';
    end if;
    insert into public.household_members(household_id,user_id,role) values(v_household.id,v_invite.invited_user_id,'member');
  end if;
  update public.household_invites set status = case when p_action = 'approve' then 'accepted' else 'declined' end,
    responded_at = now() where token = p_token;
  return v_household.id;
end;
$$;

revoke all on function public.set_family_location_sharing(uuid, boolean), public.share_family_checkin(uuid, double precision, double precision, double precision, timestamptz), public.revoke_family_checkin(uuid), public.create_family_household(text), public.respond_family_invite(uuid,text), public.approve_family_request(uuid,text) from public, anon;
grant execute on function public.set_family_location_sharing(uuid, boolean), public.share_family_checkin(uuid, double precision, double precision, double precision, timestamptz), public.revoke_family_checkin(uuid), public.create_family_household(text), public.respond_family_invite(uuid,text), public.approve_family_request(uuid,text) to authenticated;

-- A single MVCC/RLS snapshot prevents partial-page cache eviction and observes
-- newly granted old rows, deleted memberships, and permission downgrades.
-- Refuse oversized snapshots explicitly rather than returning a truncated list.
create or replace function public.family_content_snapshot() returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if (select count(*) from public.folders where household_id is not null) > 10000
    or (select count(*) from public.items where household_id is not null and type in ('note','url','reminder')) > 10000 then
    raise exception 'family_snapshot_too_large' using errcode = '54000';
  end if;
  select jsonb_build_object(
    'user_id', auth.uid(),
    'folders', coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object('can_write', public.folder_can_write(f.client_id, auth.uid())))
      from public.folders f where f.household_id is not null), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('can_write',
      public.family_is_member(i.household_id) and (i.folder_id is null or public.folder_can_write(i.folder_id, auth.uid()))))
      from public.items i where i.household_id is not null and i.type in ('note','url','reminder')), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.family_content_snapshot() from public, anon;
grant execute on function public.family_content_snapshot() to authenticated;

-- Replace-all permissions atomically; do not temporarily expose a selected
-- folder to everybody between an HTTP delete and insert. Leaving the family
-- revokes even the original creator's ability to administer it.
create or replace function public.set_family_folder_permissions(p_folder_id uuid, p_share_mode text, p_permissions jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_folder public.folders;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into v_folder from public.folders where client_id = p_folder_id for update;
  if not found or v_folder.user_id <> auth.uid() or not public.family_is_member(v_folder.household_id) then
    raise exception 'family_owner_required' using errcode = '42501';
  end if;
  if p_share_mode is not null and p_share_mode not in ('all','select') then
    raise exception 'invalid_folder_permissions' using errcode = '22023';
  end if;
  if p_permissions is not null then
    if jsonb_typeof(p_permissions) <> 'array' or jsonb_array_length(p_permissions) > 100 then
      raise exception 'invalid_folder_permissions' using errcode = '22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_permissions) p where
      jsonb_typeof(p->'userId') is distinct from 'string'
      or jsonb_typeof(p->'canRead') is distinct from 'boolean'
      or jsonb_typeof(p->'canWrite') is distinct from 'boolean'
      or not exists(select 1 from public.household_members m where m.household_id = v_folder.household_id and m.user_id = (p->>'userId')::uuid)) then
      raise exception 'invalid_folder_permissions' using errcode = '22023';
    end if;
    delete from public.folder_member_permissions where folder_id = p_folder_id;
    insert into public.folder_member_permissions(folder_id,user_id,can_read,can_write)
      select p_folder_id, (p->>'userId')::uuid, (p->>'canRead')::boolean,
        (p->>'canRead')::boolean and (p->>'canWrite')::boolean
      from jsonb_array_elements(p_permissions) p;
  end if;
  if p_share_mode is not null then update public.folders set share_mode = p_share_mode where client_id = p_folder_id; end if;
end;
$$;
revoke all on function public.set_family_folder_permissions(uuid,text,jsonb) from public, anon;
grant execute on function public.set_family_folder_permissions(uuid,text,jsonb) to authenticated;

-- Deleting a family deliberately deletes its shared notes/folders, rather than
-- silently changing everybody's shared rows into private rows via SET NULL.
create or replace function public.family_delete_content() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.items where household_id = old.id;
  delete from public.folders where household_id = old.id;
  return old;
end;
$$;
create trigger family_household_delete_content before delete on public.households
for each row execute function public.family_delete_content();

commit;
