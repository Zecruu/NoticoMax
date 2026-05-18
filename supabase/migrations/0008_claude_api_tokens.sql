-- claude_api_tokens — Long-lived opaque tokens for the /noticomax CLI flow.
-- Lets Claude Code on a remote machine call /api/skills without re-grabbing a
-- Supabase access_token every hour. Tokens are issued in Settings → Claude Code
-- API tokens; the full token is shown once on creation and only a SHA-256 hash
-- is stored. The Bearer-auth helper accepts both these tokens (prefix sk_nm_)
-- and short-lived Supabase JWTs.

create table claude_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  last4 text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index claude_api_tokens_user_idx on claude_api_tokens (user_id);

alter table claude_api_tokens enable row level security;

create policy "claude_api_tokens_select_own"
  on claude_api_tokens for select
  using (auth.uid() = user_id);

create policy "claude_api_tokens_insert_own"
  on claude_api_tokens for insert
  with check (auth.uid() = user_id);

create policy "claude_api_tokens_delete_own"
  on claude_api_tokens for delete
  using (auth.uid() = user_id);
