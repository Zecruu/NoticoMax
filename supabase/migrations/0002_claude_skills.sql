-- claude_skills — Cloud-synced Claude Code skills + Codex CLI prompts.
-- Replaces the deleted Mongo ClaudeSkill model. Backs the /api/skills CRUD
-- the `/noticomax push|pull` slash command talks to.

create table claude_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null check (tool in ('claude', 'codex')),
  name text not null,
  description text not null default '',
  frontmatter jsonb not null default '{}',
  content text not null,
  supporting_files jsonb not null default '[]',
  tags text[] not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool, name)
);

create index claude_skills_user_idx on claude_skills (user_id);
create index claude_skills_public_idx on claude_skills (is_public) where is_public = true;
create index claude_skills_tags_idx on claude_skills using gin (tags);

create trigger claude_skills_set_updated_at
  before update on claude_skills
  for each row execute function set_updated_at();

alter table claude_skills enable row level security;

-- A user can read their own skills, plus any public skills (for sharing).
create policy "claude_skills_select_own_or_public"
  on claude_skills for select
  using (auth.uid() = user_id or is_public = true);

create policy "claude_skills_insert_own"
  on claude_skills for insert
  with check (auth.uid() = user_id);

create policy "claude_skills_update_own"
  on claude_skills for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "claude_skills_delete_own"
  on claude_skills for delete
  using (auth.uid() = user_id);
