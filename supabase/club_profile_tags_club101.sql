-- Detailed Club profiles and a strict three-tag taxonomy for discovery.
-- Run after core_platform.sql and custom_permissions.sql.
begin;

alter table public.clubs add column if not exists full_description text;
alter table public.clubs add column if not exists mission text;
alter table public.clubs add column if not exists activities text;
alter table public.clubs add column if not exists who_should_join text;
alter table public.clubs add column if not exists membership_expectations text;
alter table public.clubs add column if not exists weekly_commitment_hours numeric(4,1) not null default 0;

update public.clubs
set full_description=short_description
where full_description is null;

-- Older editors allowed more tags and did not normalize whitespace or duplicates.
-- Preserve the first three valid, case-insensitively unique tags in display order.
update public.clubs c set interest_tags=coalesce((
  select array_agg(clean order by ord) from (
    select clean,ord from (
      select distinct on(lower(btrim(value))) btrim(value) as clean,ord
      from unnest(c.interest_tags) with ordinality as u(value,ord)
      where value is not null and char_length(btrim(value)) between 2 and 30
      order by lower(btrim(value)),ord
    ) unique_tags order by ord limit 3
  ) kept
),array[case when c.is_stem then 'STEM' when c.is_community_service then 'Community Service' else 'Other' end]);

alter table public.clubs alter column full_description set not null;
alter table public.clubs drop constraint if exists clubs_full_description_check;
alter table public.clubs add constraint clubs_full_description_check
  check(char_length(btrim(full_description)) between 10 and 5000);
alter table public.clubs drop constraint if exists clubs_profile_sections_check;
alter table public.clubs add constraint clubs_profile_sections_check check(
  (mission is null or char_length(btrim(mission)) between 1 and 1500)
  and (activities is null or char_length(btrim(activities)) between 1 and 3000)
  and (who_should_join is null or char_length(btrim(who_should_join)) between 1 and 1500)
  and (membership_expectations is null or char_length(btrim(membership_expectations)) between 1 and 1500)
  and weekly_commitment_hours between 0 and 40
);

create or replace function public.valid_club_tags(tags text[])
returns boolean language plpgsql immutable set search_path=public as $$
declare tag text; normalized text[]:='{}';
begin
  if tags is null or cardinality(tags) not between 1 and 3 then return false; end if;
  foreach tag in array tags loop
    if tag is null or tag<>btrim(tag) or char_length(tag) not between 2 and 30 then return false; end if;
    if lower(tag)=any(normalized) then return false; end if;
    normalized:=array_append(normalized,lower(tag));
  end loop;
  return true;
end $$;
revoke all on function public.valid_club_tags(text[]) from public,anon,authenticated;

create or replace function public.fill_club_profile_defaults()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.full_description is null or btrim(new.full_description)='' then
    new.full_description:=new.short_description;
  end if;
  if new.interest_tags is null or cardinality(new.interest_tags)=0 then
    new.interest_tags:=array[case when new.is_stem then 'STEM' when new.is_community_service then 'Community Service' else 'Other' end];
  end if;
  return new;
end $$;
revoke all on function public.fill_club_profile_defaults() from public,anon,authenticated;
drop trigger if exists fill_club_profile_defaults on public.clubs;
create trigger fill_club_profile_defaults before insert or update of short_description,full_description,interest_tags,is_stem,is_community_service
on public.clubs for each row execute function public.fill_club_profile_defaults();

alter table public.clubs drop constraint if exists clubs_interest_tags_check;
alter table public.clubs add constraint clubs_interest_tags_check check(public.valid_club_tags(interest_tags));
create index if not exists clubs_interest_tags_gin_idx on public.clubs using gin(interest_tags);

commit;
