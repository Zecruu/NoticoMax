-- Family Plan — Ship 1d / 1e + Storage plans scaffolding
--
-- Adds entitlements columns for:
--   - family_plan_active  — boolean, gates POST /api/households
--   - extra_seats         — int, applied via "Buy seat" IAP, owner can spend
--                           by bumping a household's max_seats
--   - storage_plan        — placeholder enum for personal/family storage tiers
--                           (file upload feature itself is not yet built —
--                           this is so the entitlement is in place when it ships)
--
-- Run in Supabase SQL Editor after 0009.

alter table entitlements add column family_plan_active boolean not null default false;
alter table entitlements add column extra_seats int not null default 0;
alter table entitlements add column storage_plan text not null default 'free' check (
  storage_plan in (
    'free',           -- 100 MB included w/ Pro
    'personal_5gb',
    'personal_50gb',
    'personal_200gb',
    'family_20gb',    -- requires family_plan_active
    'family_100gb',
    'family_500gb'
  )
);

-- Track how many bytes each user has actually stored (updated by the
-- file-upload service once it lands; for now stays at 0).
alter table entitlements add column storage_bytes_used bigint not null default 0;
