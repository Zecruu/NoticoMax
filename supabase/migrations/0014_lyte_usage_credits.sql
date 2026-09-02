-- Lyte usage extras + which paid assistant tier the user is on.
-- Extra chats/lookups are consumable IAP grants (do not reset monthly).
-- assistant_plan is plus | platinum | maxxed (code IDs; public names are Pro / Platinum / MAXXED).

alter table entitlements
  add column if not exists assistant_plan text
    check (assistant_plan in ('plus', 'platinum', 'maxxed'));

alter table entitlements
  add column if not exists lyte_extra_chats integer not null default 0;

alter table entitlements
  add column if not exists lyte_extra_lookups integer not null default 0;

-- Atomic consume: returns remaining extras, or null if none were available.
create or replace function consume_lyte_extra(p_user_id uuid, p_kind text)
returns integer
language plpgsql
as $$
declare
  remaining integer;
begin
  if p_kind = 'chats' then
    update entitlements
      set lyte_extra_chats = lyte_extra_chats - 1
      where user_id = p_user_id and lyte_extra_chats > 0
      returning lyte_extra_chats into remaining;
  elsif p_kind = 'lookups' then
    update entitlements
      set lyte_extra_lookups = lyte_extra_lookups - 1
      where user_id = p_user_id and lyte_extra_lookups > 0
      returning lyte_extra_lookups into remaining;
  else
    raise exception 'unknown lyte kind: %', p_kind;
  end if;
  return remaining;
end;
$$;

-- Atomic grant for RevenueCat consumable webhooks.
create or replace function grant_lyte_extra(p_user_id uuid, p_kind text, p_amount integer)
returns integer
language plpgsql
as $$
declare
  remaining integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'lyte grant amount must be positive';
  end if;
  insert into entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if p_kind = 'chats' then
    update entitlements
      set lyte_extra_chats = lyte_extra_chats + p_amount
      where user_id = p_user_id
      returning lyte_extra_chats into remaining;
  elsif p_kind = 'lookups' then
    update entitlements
      set lyte_extra_lookups = lyte_extra_lookups + p_amount
      where user_id = p_user_id
      returning lyte_extra_lookups into remaining;
  else
    raise exception 'unknown lyte kind: %', p_kind;
  end if;
  return remaining;
end;
$$;
