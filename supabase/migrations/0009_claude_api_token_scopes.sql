-- claude_api_tokens.scopes — restrict each API token to a subset of capabilities
-- so a leaked CLI token can't read everything a user owns. Existing tokens are
-- backfilled to {skills} (the only thing they were ever used for) to preserve
-- behavior.
--
-- Known scopes today: 'skills' (read/write claude_skills) and 'envvars' (read/write
-- items of type='envvar'). Add new scopes by extending the requireBearerScope
-- helper in src/lib/supabase/bearer-auth.ts — no further migration needed.

alter table claude_api_tokens
  add column scopes text[] not null default '{skills}';

create index claude_api_tokens_scopes_idx on claude_api_tokens using gin (scopes);
