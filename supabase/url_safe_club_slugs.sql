-- Prefer readable Club URLs. A short application suffix is kept only when a
-- second Club would otherwise receive the same slug.
begin;

do $$
declare
  target record;
  clean_slug text;
begin
  for target in
    select id, slug, name
    from public.clubs
    where slug ~ '-[0-9a-f]{8}$'
    order by created_at, id
  loop
    clean_slug := trim(both '-' from regexp_replace(lower(target.name), '[^a-z0-9]+', '-', 'g'));
    if clean_slug <> '' and not exists (
      select 1 from public.clubs other
      where other.slug = clean_slug and other.id <> target.id
    ) then
      delete from public.club_interests duplicate
      using public.club_interests existing
      where duplicate.club_slug = target.slug
        and existing.club_slug = clean_slug
        and duplicate.user_id = existing.user_id;
      update public.club_interests set club_slug = clean_slug where club_slug = target.slug;
      update public.clubs set slug = clean_slug, updated_at = now() where id = target.id;
    end if;
  end loop;
end;
$$;

create or replace function public.promote_approved_club_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_slug text;
  selected_slug text;
  promoted_club_id uuid;
  teacher_name text;
  teacher_email text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if new.submitted_by is null or not exists (
      select 1 from public.profiles p where p.id = new.submitted_by and p.role = 'teacher'
    ) then
      raise exception 'Approved Club applications require a teacher applicant' using errcode = '23514';
    end if;

    base_slug := trim(both '-' from regexp_replace(lower(new.club_name), '[^a-z0-9]+', '-', 'g'));
    selected_slug := case when exists (select 1 from public.clubs where slug = base_slug)
      then base_slug || '-' || left(new.id::text, 8)
      else base_slug
    end;

    insert into public.clubs (
      slug, name, short_description, interest_tags, is_stem,
      is_community_service, contact_email, created_by, status
    ) values (
      selected_slug, new.club_name, new.description, array[new.category],
      new.category = 'STEM', new.category = 'Community Service',
      new.contact_email, new.submitted_by, 'published'
    )
    on conflict (slug) do update set
      name = excluded.name,
      short_description = excluded.short_description,
      interest_tags = excluded.interest_tags,
      is_stem = excluded.is_stem,
      is_community_service = excluded.is_community_service,
      contact_email = excluded.contact_email,
      status = 'published',
      updated_at = now()
    returning id into promoted_club_id;

    select p.full_name, p.email into teacher_name, teacher_email
    from public.profiles p where p.id = new.submitted_by;
    insert into public.club_advisors (club_id, profile_id, display_name, contact_email)
    values (promoted_club_id, new.submitted_by, teacher_name, teacher_email)
    on conflict (club_id, profile_id) do update set
      display_name = excluded.display_name,
      contact_email = excluded.contact_email;
  end if;
  return new;
end;
$$;

revoke all on function public.promote_approved_club_application() from public, anon, authenticated;

commit;
