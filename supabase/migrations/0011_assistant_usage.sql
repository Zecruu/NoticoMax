-- assistant_usage — per-call ledger for the Notico AI assistant (Gemini).
-- Every assistant request appends a row: a 'rejected' row when a budget cap
-- blocks it pre-call (auditable abuse/rate-limit trail), a 'completed' row with
-- actual token usage + cost after a successful model call, or 'failed' on a
-- provider error. The server reads aggregates of 'completed' rows BEFORE each
-- call to enforce spend + action caps (see src/lib/ai/usage.ts). Rows are
-- written with the service-role client (RLS bypassed); users may only read
-- their own usage.

create table assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  -- Reserved for future per-household accounting; null for personal usage.
  household_id uuid,
  -- e.g. '2026-06' — cheap monthly roll-ups / reporting alongside created_at.
  period_key text not null,
  feature text not null default 'assistant_chat',
  provider text not null default 'google',
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  -- Fractional cents so sub-cent Flash-Lite calls don't all round to 0.
  estimated_cost_cents numeric(12,6) not null default 0,
  actual_cost_cents numeric(12,6) not null default 0,
  status text not null default 'completed'
    check (status in ('reserved', 'completed', 'rejected', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Budget queries filter by (user_id, created_at >= window-start) and status, so
-- a composite index keeps the daily/monthly roll-ups cheap.
create index assistant_usage_user_created_idx
  on assistant_usage (user_id, created_at desc);

alter table assistant_usage enable row level security;

-- Read-only for the owner. Inserts happen server-side via the service role,
-- which bypasses RLS, so no insert/update/delete policy is granted to users.
create policy "assistant_usage_select_own"
  on assistant_usage for select
  using (auth.uid() = user_id);
