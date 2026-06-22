-- assistant_usage — per-call ledger for the Notico AI assistant (Gemini).
-- Every successful model call appends one row recording the estimated cost and
-- token counts. The server reads aggregates from this table BEFORE each call to
-- enforce spend + action caps (see src/lib/ai/usage.ts). Rows are written with
-- the service-role client (RLS bypassed); users may only read their own usage.

create table assistant_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  action text not null default 'chat',
  -- Fractional cents so sub-cent Flash-Lite calls don't all round to 0.
  cost_cents numeric(12,6) not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0
);

-- Budget queries always filter by (user_id, created_at >= window-start), so a
-- composite index keeps the daily/monthly roll-ups cheap.
create index assistant_usage_user_created_idx
  on assistant_usage (user_id, created_at desc);

alter table assistant_usage enable row level security;

-- Read-only for the owner. Inserts happen server-side via the service role,
-- which bypasses RLS, so no insert/update/delete policy is granted to users.
create policy "assistant_usage_select_own"
  on assistant_usage for select
  using (auth.uid() = user_id);
