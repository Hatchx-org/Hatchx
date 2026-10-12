-- Add scholarships to an existing opportunity catalog.
-- New databases already receive this value through core_platform.sql.

alter table public.opportunities
  drop constraint if exists opportunities_category_check;

alter table public.opportunities
  add constraint opportunities_category_check
  check (category in (
    'election',
    'community_service',
    'internship',
    'pre_college',
    'scholarship',
    'discount'
  ));
