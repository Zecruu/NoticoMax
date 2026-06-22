-- Notico assistant: profile, memory, and tool-audit tables.
--
-- All three are written server-side only via the service-role client, behind
-- the gated assistant API (allow-listed email today). RLS grants the owner
-- read access so a future direct-client read path is safe, but no
-- insert/update/delete policies are granted to users — writes go through the
-- validated server endpoints. Secrets/passwords are never stored here.

-- ===========================================================================
-- assistant_profile — one row per user; names + styles their assistant.
-- ===========================================================================
create table assistant_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Notico',
  style_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger assistant_profile_set_updated_at
  before update on assistant_profile
  for each row execute function set_updated_at();

alter table assistant_profile enable row level security;

create policy "assistant_profile_select_own"
  on assistant_profile for select
  using (auth.uid() = user_id);

-- ===========================================================================
-- assistant_memory — user-owned, inspectable, deletable preferences/habits.
-- NEVER stores secrets, passwords, tokens, or payment data.
-- ===========================================================================
create table assistant_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'preference'
    check (type in ('preference', 'instruction', 'do', 'dont', 'fact', 'style')),
  content text not null,
  source text not null default 'user_explicit'
    check (source in ('user_explicit', 'assistant_inferred', 'system')),
  confidence numeric(3, 2) not null default 1.0,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_memory_user_idx on assistant_memory (user_id, created_at desc);

create trigger assistant_memory_set_updated_at
  before update on assistant_memory
  for each row execute function set_updated_at();

alter table assistant_memory enable row level security;

create policy "assistant_memory_select_own"
  on assistant_memory for select
  using (auth.uid() = user_id);

-- ===========================================================================
-- assistant_tool_audit — every tool request the assistant makes, logged.
-- ===========================================================================
create table assistant_tool_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  status text not null check (status in ('validated', 'executed', 'rejected', 'failed')),
  -- client_id of the item the tool created, when executed.
  target_client_id uuid,
  args jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index assistant_tool_audit_user_idx on assistant_tool_audit (user_id, created_at desc);

alter table assistant_tool_audit enable row level security;

create policy "assistant_tool_audit_select_own"
  on assistant_tool_audit for select
  using (auth.uid() = user_id);
