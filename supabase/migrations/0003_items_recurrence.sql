-- Add recurrence column to items so reminders can repeat (daily / weekly /
-- monthly / yearly) and the rule round-trips across devices.
-- Existing rows default to NULL (treated as "none" client-side).

alter table items add column if not exists recurrence text
  check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly'));
