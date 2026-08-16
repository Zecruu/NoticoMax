-- Lyte rebrand: the assistant's default name changes from 'Notico' to 'Lyte'.
--
-- Only the DEFAULT and rows still carrying the old default are touched — a
-- user who renamed their assistant keeps their name. (Edge case: a user who
-- explicitly typed "Notico" is folded into the rebrand; acceptable.)
--
-- Requires 0012 (creates assistant_profile). On fresh environments run
-- 0011 → 0012 → 0013 in order.

alter table assistant_profile
  alter column display_name set default 'Lyte';

update assistant_profile
  set display_name = 'Lyte'
  where display_name = 'Notico';
