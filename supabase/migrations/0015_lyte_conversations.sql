-- Saved Lyte history. Apply after 0014. No changes to existing notes or chats.
-- Meter logical UTF-8 title/message bytes, not database/index overhead.
-- Pending turns reserve 64 KiB for the reply, released on completion/failure.
-- All mutations run through service-only functions under a per-user row lock.
begin;

create table public.lyte_conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 72),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index lyte_conversations_owner_updated on public.lyte_conversations(user_id, updated_at desc, id desc);

create table public.lyte_conversation_turns (
  id bigint generated always as identity primary key,
  conversation_id uuid not null,
  user_id uuid not null,
  request_id uuid not null,
  user_content text not null check (octet_length(user_content) between 1 and 16384),
  assistant_content text check (octet_length(assistant_content) <= 65536),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  reserved_bytes integer not null default 65536 check (reserved_bytes in (0, 65536)),
  created_at timestamptz not null default now(),
  unique (user_id, request_id),
  foreign key (conversation_id, user_id) references public.lyte_conversations(id, user_id) on delete cascade
);
create index lyte_turns_conversation on public.lyte_conversation_turns(conversation_id, id desc);
alter table public.lyte_conversations enable row level security;
alter table public.lyte_conversation_turns enable row level security;
create policy lyte_conversations_owner_read on public.lyte_conversations for select to authenticated using (auth.uid() = user_id);
create policy lyte_turns_owner_read on public.lyte_conversation_turns for select to authenticated using (auth.uid() = user_id);
revoke all on public.lyte_conversations, public.lyte_conversation_turns from anon, authenticated;
grant select on public.lyte_conversations, public.lyte_conversation_turns to authenticated;
grant all on public.lyte_conversations, public.lyte_conversation_turns to service_role;
grant usage, select on sequence public.lyte_conversation_turns_id_seq to service_role;

create function public.lyte_storage_limit(p_plan text) returns bigint
language sql immutable set search_path = '' as $$
  select case p_plan
    when 'personal_5gb' then 5368709120
    when 'personal_50gb' then 53687091200
    when 'personal_200gb' then 214748364800
    when 'family_20gb' then 21474836480
    when 'family_100gb' then 107374182400
    when 'family_500gb' then 536870912000
    else 104857600 end::bigint
$$;

create function public.lyte_begin_turn(p_user uuid, p_conversation uuid, p_request uuid, p_content text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.entitlements%rowtype;
  c public.lyte_conversations%rowtype;
  t public.lyte_conversation_turns%rowtype;
  title_text text;
  delta bigint;
  released bigint;
begin
  if p_content is null or octet_length(p_content) not between 1 and 16384 then raise exception 'invalid_message'; end if;
  insert into public.entitlements(user_id) values(p_user) on conflict do nothing;
  select * into e from public.entitlements where user_id = p_user for update;
  select * into t from public.lyte_conversation_turns where user_id = p_user and request_id = p_request;
  if found then
    if t.conversation_id <> p_conversation or t.user_content <> p_content then raise exception 'request_conflict'; end if;
    return jsonb_build_object('status', t.status, 'reply', t.assistant_content);
  end if;
  select * into c from public.lyte_conversations where id = p_conversation for update;
  if found and c.user_id <> p_user then raise exception 'conversation_not_found'; end if;
  if c.id is null then
    title_text := left(regexp_replace(btrim(p_content), '\s+', ' ', 'g'), 72);
    if title_text = '' then title_text := 'New chat'; end if;
    insert into public.lyte_conversations(id, user_id, title, storage_bytes)
      values(p_conversation, p_user, title_text, octet_length(title_text)) returning * into c;
    e.storage_bytes_used := e.storage_bytes_used + c.storage_bytes;
  end if;
  -- A crashed request is never replayed. A subsequent new turn may release its
  -- reply reservation after two minutes (provider timeout is thirty seconds).
  with expired as (
    update public.lyte_conversation_turns set status = 'failed', reserved_bytes = 0
    where conversation_id = p_conversation and status = 'pending' and created_at < now() - interval '2 minutes'
    returning 65536 as bytes
  ) select coalesce(sum(bytes), 0) into released from expired;
  c.storage_bytes := c.storage_bytes - released;
  e.storage_bytes_used := e.storage_bytes_used - released;
  if exists(select 1 from public.lyte_conversation_turns where conversation_id = p_conversation and status = 'pending') then
    raise exception 'conversation_busy';
  end if;
  delta := octet_length(p_content) + 65536;
  if e.storage_bytes_used + delta > public.lyte_storage_limit(e.storage_plan) then raise exception 'storage_full'; end if;
  insert into public.lyte_conversation_turns(conversation_id, user_id, request_id, user_content)
    values(p_conversation, p_user, p_request, p_content);
  update public.entitlements set storage_bytes_used = e.storage_bytes_used + delta where user_id = p_user;
  update public.lyte_conversations set storage_bytes = c.storage_bytes + delta, updated_at = clock_timestamp() where id = p_conversation;
  return jsonb_build_object('status', 'started');
end;
$$;

create function public.lyte_finish_turn(p_user uuid, p_request uuid, p_reply text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.lyte_conversation_turns%rowtype; delta bigint;
begin
  perform 1 from public.entitlements where user_id = p_user for update;
  select * into t from public.lyte_conversation_turns where user_id = p_user and request_id = p_request for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if t.status <> 'pending' then return; end if;
  if p_reply is not null and octet_length(p_reply) > 65536 then raise exception 'reply_too_large'; end if;
  delta := coalesce(octet_length(p_reply), 0) - t.reserved_bytes;
  update public.lyte_conversation_turns set assistant_content = p_reply,
    status = case when p_reply is null then 'failed' else 'completed' end, reserved_bytes = 0 where id = t.id;
  update public.lyte_conversations set storage_bytes = storage_bytes + delta, updated_at = clock_timestamp() where id = t.conversation_id;
  update public.entitlements set storage_bytes_used = greatest(0, storage_bytes_used + delta) where user_id = p_user;
end;
$$;

create function public.lyte_delete_conversation(p_user uuid, p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.lyte_conversations%rowtype;
begin
  perform 1 from public.entitlements where user_id = p_user for update;
  select * into c from public.lyte_conversations where id = p_conversation and user_id = p_user for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if exists(select 1 from public.lyte_conversation_turns where conversation_id = p_conversation and status = 'pending' and created_at >= now() - interval '2 minutes') then
    raise exception 'conversation_busy';
  end if;
  delete from public.lyte_conversations where id = c.id;
  update public.entitlements set storage_bytes_used = greatest(0, storage_bytes_used - c.storage_bytes) where user_id = p_user;
end;
$$;

revoke all on function public.lyte_storage_limit(text), public.lyte_begin_turn(uuid, uuid, uuid, text), public.lyte_finish_turn(uuid, uuid, text), public.lyte_delete_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lyte_storage_limit(text), public.lyte_begin_turn(uuid, uuid, uuid, text), public.lyte_finish_turn(uuid, uuid, text), public.lyte_delete_conversation(uuid, uuid) to service_role;
commit;
