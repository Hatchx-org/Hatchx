-- Teacher-led Club creation: teachers apply, Admins decide, approval publishes
-- the Club and assigns the submitting teacher as its first Advisor.

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher'
  );
$$;
revoke all on function public.is_teacher() from public, anon, authenticated;
grant execute on function public.is_teacher() to authenticated;

-- Legacy deployments may contain additional application columns that are no
-- longer part of the canonical write model but are still marked NOT NULL.
-- Relax only those superseded columns; canonical required fields remain
-- protected by their existing NOT NULL and content constraints.
do $$
declare
  legacy_column record;
begin
  for legacy_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'club_applications'
      and is_nullable = 'NO'
      and column_name not in (
        'id', 'club_name', 'category', 'description', 'status', 'created_at'
      )
  loop
    execute format(
      'alter table public.club_applications alter column %I drop not null',
      legacy_column.column_name
    );
  end loop;
end;
$$;

-- Some production databases still retain required legacy columns from the
-- original dashboard schema. Populate those columns from the canonical fields
-- before constraints run. jsonb_populate_record safely ignores keys that do
-- not exist on newer installations.
create or replace function public.sync_club_application_legacy_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new := jsonb_populate_record(
    new,
    jsonb_build_object(
      'club_category', new.category,
      'club_description', new.description,
      'meeting_dates', coalesce(new.meeting_days, ''),
      'club_appsStatus', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists sync_club_application_legacy_columns on public.club_applications;
create trigger sync_club_application_legacy_columns
  before insert or update of category, description, meeting_days, status
  on public.club_applications
  for each row execute function public.sync_club_application_legacy_columns();

revoke all on function public.sync_club_application_legacy_columns() from public, anon, authenticated;

drop policy if exists "Members can submit applications" on public.club_applications;
drop policy if exists "Members submit applications" on public.club_applications;
drop policy if exists "Teachers submit Club applications" on public.club_applications;
create policy "Teachers submit Club applications"
  on public.club_applications for insert
  with check (
    auth.uid() = submitted_by
    and public.is_teacher()
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

drop policy if exists "Admins review applications" on public.club_applications;
drop policy if exists "Staff review applications" on public.club_applications;
drop policy if exists "Admins review Club applications" on public.club_applications;
create policy "Admins review Club applications"
  on public.club_applications for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.club_applications to authenticated;

create or replace function public.promote_approved_club_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_slug text;
  promoted_club_id uuid;
  teacher_name text;
  teacher_email text;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if new.submitted_by is null or not exists (
      select 1 from public.profiles p
      where p.id = new.submitted_by and p.role = 'teacher'
    ) then
      raise exception 'Approved Club applications require a teacher applicant' using errcode = '23514';
    end if;

    base_slug := trim(both '-' from regexp_replace(lower(new.club_name), '[^a-z0-9]+', '-', 'g'));
    insert into public.clubs (
      slug, name, short_description, interest_tags, is_stem,
      is_community_service, contact_email, created_by, status
    ) values (
      case when exists (select 1 from public.clubs where slug = base_slug)
        then base_slug || '-' || left(new.id::text, 8)
        else base_slug
      end, new.club_name, new.description,
      array[new.category], new.category = 'STEM', new.category = 'Community Service',
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

drop trigger if exists approved_application_creates_club on public.club_applications;
create trigger approved_application_creates_club
  after insert or update of status on public.club_applications
  for each row execute function public.promote_approved_club_application();

revoke all on function public.promote_approved_club_application() from public, anon, authenticated;
