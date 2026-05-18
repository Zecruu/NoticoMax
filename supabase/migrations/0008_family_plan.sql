-- Family Plan — Ship 1b
-- Builds on 0007_households.sql.
--
-- Adds:
--   1. A short, human-shareable family_code on each household (6 chars, no
--      ambiguous letters). The admin shares this code; members type it in.
--   2. max_seats (default 5) — enforced when accepting requests.
--   3. subscription_plan placeholder — wired up properly in Ship 1d.
--   4. Extends household_invites with a 'requested' status (member-initiated)
--      and makes invited_email nullable (code-based requests don't target an
--      email address).
--
-- Run in Supabase SQL Editor.

-- ===========================================================================
-- Family code generator — base32 alphabet minus ambiguous chars (0/O/1/I/L)
-- ===========================================================================

create or replace function generate_family_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
  candidate text;
  attempts int := 0;
begin
  -- Retry on the (vanishingly small) chance of collision with an existing code.
  -- 31^6 = ~887M combos; with a few thousand households the birthday-paradox
  -- collision odds are still well under 1%.
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    perform 1 from households where family_code = candidate;
    if not found then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'generate_family_code: too many collisions (alphabet exhausted?)';
    end if;
  end loop;
end;
$$ language plpgsql;

-- ===========================================================================
-- households additions
-- ===========================================================================

alter table households add column family_code text;
alter table households add column max_seats   int  not null default 5;
alter table households add column subscription_plan text not null default 'free'
  check (subscription_plan in ('free', 'family', 'family_plus'));

-- Backfill family_code for any existing rows (created in Ship 1a testing).
update households set family_code = generate_family_code() where family_code is null;

-- Now make it required + unique. Codes are case-insensitive for lookup; we
-- store them uppercase and lowercase the user input at the API layer.
alter table households alter column family_code set not null;
create unique index households_family_code_idx on households(family_code);

-- Auto-fill family_code on insert when the caller doesn't supply one.
create or replace function households_default_family_code() returns trigger as $$
begin
  if new.family_code is null then
    new.family_code := generate_family_code();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger households_set_family_code
  before insert on households
  for each row execute function households_default_family_code();

-- ===========================================================================
-- household_invites — extend status, relax invited_email, document the model
-- ===========================================================================
--
-- Status semantics:
--   pending   — admin sent an email invite, awaiting member action (Ship 1a)
--   requested — member entered the family code, awaiting admin approval (new)
--   accepted  — member is in the household
--   revoked   — admin or member cancelled before acceptance
--   expired   — auto-set when expires_at < now()

alter table household_invites drop constraint if exists household_invites_status_check;
alter table household_invites add constraint household_invites_status_check
  check (status in ('pending', 'requested', 'accepted', 'revoked', 'declined', 'expired'));

-- Code-based requests don't target an email — they're self-initiated by the
-- already-logged-in member. Make the column nullable so we can store either
-- shape in one table.
alter table household_invites alter column invited_email drop not null;

-- For code-based requests, invited_user_id MUST be set (the requester) and
-- invited_by is the requester themselves. For email invites (Ship 1a path)
-- invited_by is the admin.

-- ===========================================================================
-- RLS — let requesters create their own 'requested' invite rows
-- ===========================================================================
--
-- Existing 1a policy required invited_by to be a household member, which
-- locked outsiders out of even applying. Add a separate policy for the
-- 'requested' flow that allows ANY authenticated user to insert a row
-- targeting themselves with status='requested'. The server-side endpoint is
-- still the canonical path (it adds rate limiting, idempotency, etc.) but
-- the RLS allows the client direct write if needed.

create policy "household_invites_self_request" on household_invites
  for insert to authenticated
  with check (
    status = 'requested'
    and invited_user_id = auth.uid()
    and invited_by = auth.uid()
  );

-- The admin (any household member, broadened later if you want owner-only)
-- needs to read pending requests for households they belong to. The existing
-- "household_invites_visible_to_party" policy already covers this since
-- invited_by = requester for self-requests AND members can see invites for
-- their households.
