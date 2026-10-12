-- Publish the latest constitution with each published Club and backfill
-- Advisor display names from their linked profile records.
begin;

update public.club_advisors advisor
set display_name = profile.full_name,
    contact_email = coalesce(advisor.contact_email, profile.email)
from public.profiles profile
where advisor.profile_id = profile.id
  and nullif(btrim(coalesce(advisor.display_name, '')), '') is null
  and nullif(btrim(coalesce(profile.full_name, '')), '') is not null;

drop policy if exists "Public reads published Club constitutions" on public.club_constitution_versions;
create policy "Public reads published Club constitutions"
on public.club_constitution_versions
for select
using (
  exists (
    select 1 from public.clubs club
    where club.id = club_id and club.status = 'published'
  )
);

commit;
