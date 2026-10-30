-- Unified Family workspace: atomic shared lists and persistent shared place pins.
-- Distinct from private locations and expiring, opt-in member check-ins.
begin;
alter table public.items add column is_checklist boolean not null default false;
alter table public.items add constraint family_checklist_scope check (not is_checklist or (type = 'note' and household_id is not null));

create table public.family_checklist_entries (
  id uuid primary key,
  item_id uuid not null references public.items(client_id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 500),
  checked boolean not null default false,
  position bigint generated always as identity,
  revision integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index family_checklist_entries_item_idx on public.family_checklist_entries(item_id, position);
alter table public.family_checklist_entries enable row level security;
create policy family_checklist_entries_read on public.family_checklist_entries for select to authenticated
using (exists(select 1 from public.items i where i.client_id = item_id and i.is_checklist and not i.deleted));
revoke all on public.family_checklist_entries from anon, authenticated;
grant select on public.family_checklist_entries to authenticated;
grant all on public.family_checklist_entries to service_role;

create table public.family_places (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 120),
  address text not null default '' check (length(address) <= 500),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index family_places_household_idx on public.family_places(household_id);
alter table public.family_places enable row level security;
create policy family_places_read on public.family_places for select to authenticated using (public.family_is_member(household_id));
revoke all on public.family_places from anon, authenticated;
grant select on public.family_places to authenticated;
grant all on public.family_places to service_role;

-- Private helper: checked permission and row locks, not callable as an API.
create function public.family_writable_checklist(p_item_id uuid) returns public.items
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items;
begin
  select * into v_item from public.items where client_id = p_item_id for update;
  if not found or not v_item.is_checklist or v_item.deleted or not public.family_is_member(v_item.household_id) then
    raise exception 'family_list_unavailable' using errcode = '42501';
  end if;
  if v_item.folder_id is not null then
    perform 1 from public.folders where client_id = v_item.folder_id for share;
    if not public.folder_can_write(v_item.folder_id, auth.uid()) then
      raise exception 'family_read_only' using errcode = '42501';
    end if;
  end if;
  return v_item;
end;
$$;
revoke all on function public.family_writable_checklist(uuid) from public, anon, authenticated;

create function public.create_family_checklist(p_id uuid, p_household_id uuid, p_folder_id uuid, p_title text, p_entries jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_folder public.folders; v_existing public.items;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  select * into v_folder from public.folders where client_id = p_folder_id for share;
  if not found or v_folder.household_id is distinct from p_household_id or v_folder.deleted or not public.folder_can_write(p_folder_id, auth.uid()) then
    raise exception 'family_read_only' using errcode = '42501';
  end if;
  if p_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120
    or p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'invalid_family_list' using errcode = '22023'; end if;
  if jsonb_array_length(p_entries) > 200 or exists(select 1 from jsonb_array_elements(p_entries) e where
    jsonb_typeof(e->'id') is distinct from 'string' or jsonb_typeof(e->'text') is distinct from 'string'
    or length(btrim(e->>'text')) not between 1 and 500) then raise exception 'invalid_family_list' using errcode = '22023'; end if;
  -- Idempotent client request identity; never overwrite another account's row.
  select * into v_existing from public.items where client_id = p_id;
  if found then
    if v_existing.user_id = auth.uid() and v_existing.folder_id = p_folder_id and v_existing.is_checklist and not v_existing.deleted then return p_id; end if;
    raise exception 'family_list_conflict' using errcode = '23505';
  end if;
  insert into public.items(client_id,user_id,type,title,content,household_id,folder_id,is_checklist)
    values(p_id,auth.uid(),'note',btrim(p_title),'',v_folder.household_id,p_folder_id,true);
  insert into public.family_checklist_entries(id,item_id,text,updated_by)
    select (e->>'id')::uuid,p_id,btrim(e->>'text'),auth.uid() from jsonb_array_elements(p_entries) e;
  return p_id;
end;
$$;

create function public.change_family_checklist_entry(
  p_item_id uuid, p_household_id uuid, p_entry_id uuid, p_action text, p_text text default null,
  p_checked boolean default null, p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items; v_entry public.family_checklist_entries;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  v_item := public.family_writable_checklist(p_item_id);
  if v_item.household_id is distinct from p_household_id then raise exception 'family_list_unavailable' using errcode = '42501'; end if;
  if p_entry_id is null or p_action is null or p_action not in ('add','set_checked','rename','delete') then raise exception 'invalid_family_list' using errcode = '22023'; end if;
  select * into v_entry from public.family_checklist_entries where id = p_entry_id and item_id = p_item_id for update;
  if p_action = 'add' then
    if p_text is null or length(btrim(p_text)) not between 1 and 500 then raise exception 'invalid_family_list' using errcode = '22023'; end if;
    if found then return to_jsonb(v_entry); end if;
    if (select count(*) from public.family_checklist_entries where item_id = p_item_id) >= 200 then raise exception 'family_list_too_long' using errcode = '54000'; end if;
    insert into public.family_checklist_entries(id,item_id,text,updated_by) values(p_entry_id,p_item_id,btrim(p_text),auth.uid()) returning * into v_entry;
  else
    if not found then
      if p_action = 'delete' then return null; end if;
      raise exception 'family_entry_missing' using errcode = '22023';
    end if;
    -- Repeated set requests are idempotent. Opposite stale intent is rejected;
    -- checking different grocery entries never rewrites the whole document.
    if p_action = 'set_checked' and p_checked is not null and p_checked = v_entry.checked then return to_jsonb(v_entry); end if;
    if p_expected_revision is null or p_expected_revision <> v_entry.revision then raise exception 'family_entry_conflict' using errcode = '40001'; end if;
    if p_action = 'set_checked' then
      if p_checked is null then raise exception 'invalid_family_list' using errcode = '22023'; end if;
      update public.family_checklist_entries set checked=p_checked,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_entry_id returning * into v_entry;
    elsif p_action = 'rename' then
      if p_text is null or length(btrim(p_text)) not between 1 and 500 then raise exception 'invalid_family_list' using errcode = '22023'; end if;
      update public.family_checklist_entries set text=btrim(p_text),revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=p_entry_id returning * into v_entry;
    else
      delete from public.family_checklist_entries where id=p_entry_id;
      update public.items set updated_at=now() where client_id=p_item_id;
      return null;
    end if;
  end if;
  update public.items set updated_at=now() where client_id=p_item_id;
  return to_jsonb(v_entry);
end;
$$;

create function public.delete_family_checklist(p_item_id uuid,p_household_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item public.items;
begin
  v_item := public.family_writable_checklist(p_item_id);
  if v_item.household_id is distinct from p_household_id then raise exception 'family_list_unavailable' using errcode='42501'; end if;
  update public.items set deleted=true,deleted_at=now(),updated_at=now() where client_id=p_item_id;
end;
$$;
revoke all on function public.delete_family_checklist(uuid,uuid) from public,anon;
grant execute on function public.delete_family_checklist(uuid,uuid) to authenticated;

create function public.save_family_place(p_id uuid,p_household_id uuid,p_title text,p_address text,p_latitude double precision,p_longitude double precision,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_place public.family_places;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform 1 from public.household_members where household_id=p_household_id and user_id=auth.uid() for key share;
  if not found then raise exception 'family_membership_required' using errcode = '42501'; end if;
  if p_id is null or p_title is null or length(btrim(p_title)) not between 1 and 120 or length(coalesce(p_address,'')) > 500
    or p_latitude is null or not(p_latitude between -90 and 90) or p_longitude is null or not(p_longitude between -180 and 180) then
    raise exception 'invalid_family_place' using errcode = '22023';
  end if;
  select * into v_place from public.family_places where id=p_id for update;
  if found then
    if v_place.household_id <> p_household_id then raise exception 'family_place_unavailable' using errcode = '42501'; end if;
    if p_expected_revision is null then
      if v_place.created_by=auth.uid() and v_place.title=btrim(p_title) and v_place.latitude=p_latitude and v_place.longitude=p_longitude and v_place.address=coalesce(p_address,'') then return to_jsonb(v_place); end if;
      raise exception 'family_place_conflict' using errcode = '40001';
    end if;
    if p_expected_revision <> v_place.revision then raise exception 'family_place_conflict' using errcode = '40001'; end if;
    update public.family_places set title=btrim(p_title),address=coalesce(p_address,''),latitude=p_latitude,longitude=p_longitude,revision=revision+1,updated_at=now() where id=p_id returning * into v_place;
  else
    if p_expected_revision is not null then raise exception 'family_place_unavailable' using errcode = '22023'; end if;
    insert into public.family_places(id,household_id,created_by,title,address,latitude,longitude)
      values(p_id,p_household_id,auth.uid(),btrim(p_title),coalesce(p_address,''),p_latitude,p_longitude) returning * into v_place;
  end if;
  return to_jsonb(v_place);
end;
$$;

create function public.delete_family_place(p_id uuid,p_expected_revision integer) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_place public.family_places;
begin
  select * into v_place from public.family_places where id=p_id for update;
  if not found then return; end if;
  if not public.family_is_member(v_place.household_id) then raise exception 'family_membership_required' using errcode = '42501'; end if;
  if p_expected_revision is null or v_place.revision <> p_expected_revision then raise exception 'family_place_conflict' using errcode = '40001'; end if;
  delete from public.family_places where id=p_id;
end;
$$;

create function public.family_workspace_snapshot(p_household_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if not public.family_is_member(p_household_id) then raise exception 'family_membership_required' using errcode = '42501'; end if;
  if (select count(*) from public.items where household_id=p_household_id and is_checklist and not deleted)>1000
    or (select count(*) from public.family_places where household_id=p_household_id)>10000 then raise exception 'family_snapshot_too_large' using errcode = '54000'; end if;
  return jsonb_build_object('householdId',p_household_id,'userId',auth.uid(),'refreshedAt',now(),
    'lists',coalesce((select jsonb_agg(jsonb_build_object('id',i.client_id,'title',i.title,'folderId',i.folder_id,'updatedAt',i.updated_at,
      'canWrite',public.folder_can_write(i.folder_id,auth.uid()),'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.position) from public.family_checklist_entries e where e.item_id=i.client_id),'[]'::jsonb)))
      from public.items i where i.household_id=p_household_id and i.is_checklist and not i.deleted),'[]'::jsonb),
    'places',coalesce((select jsonb_agg(to_jsonb(p) order by p.title) from public.family_places p where p.household_id=p_household_id),'[]'::jsonb));
end;
$$;
revoke all on function public.create_family_checklist(uuid,uuid,uuid,text,jsonb),public.change_family_checklist_entry(uuid,uuid,uuid,text,text,boolean,integer),public.save_family_place(uuid,uuid,text,text,double precision,double precision,integer),public.delete_family_place(uuid,integer),public.family_workspace_snapshot(uuid) from public,anon;
grant execute on function public.create_family_checklist(uuid,uuid,uuid,text,jsonb),public.change_family_checklist_entry(uuid,uuid,uuid,text,text,boolean,integer),public.save_family_place(uuid,uuid,text,text,double precision,double precision,integer),public.delete_family_place(uuid,integer),public.family_workspace_snapshot(uuid) to authenticated;
commit;
