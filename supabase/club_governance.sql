-- Club-specific board access, public media, and audit history.
-- Apply after core_platform.sql.

-- Governors make personnel/membership decisions. Content managers additionally
-- include active officers, whose authority remains scoped to a single club.
create or replace function public.can_govern_club(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.is_staff_or_admin() or exists (
    select 1 from public.club_advisors a
    where a.club_id = p_club_id and a.profile_id = auth.uid()
  );
$$;

create or replace function public.can_manage_club(p_club_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.can_govern_club(p_club_id) or exists (
    select 1 from public.club_officers o
    where o.club_id = p_club_id
      and o.profile_id = auth.uid()
      and (o.term_start is null or o.term_start <= current_date)
      and (o.term_end is null or o.term_end >= current_date)
  );
$$;

drop policy if exists "Managers manage club officers" on public.club_officers;
create policy "Governors manage club officers" on public.club_officers for all
  using (public.can_govern_club(club_id))
  with check (public.can_govern_club(club_id));

drop policy if exists "Managers manage club advisors" on public.club_advisors;
create policy "Staff manage club advisors" on public.club_advisors for all
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "Managers review membership" on public.club_memberships;
create policy "Governors review membership" on public.club_memberships for update
  using (public.can_govern_club(club_id))
  with check (public.can_govern_club(club_id));

create table if not exists public.club_audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.club_compliance (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  school_year text not null check (school_year ~ '^[0-9]{4}-[0-9]{4}$'),
  roster_count integer not null default 0 check (roster_count between 0 and 10000),
  constitution_on_file boolean not null default false,
  college_alignment_on_file boolean not null default false,
  annual_event_completed boolean not null default false,
  community_service_completed boolean not null default false,
  fundraiser_completed boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (club_id, school_year)
);

alter table public.club_compliance enable row level security;
drop policy if exists "Managers manage club compliance" on public.club_compliance;
create policy "Managers manage club compliance" on public.club_compliance for all
  using (public.can_manage_club(club_id))
  with check (public.can_manage_club(club_id));

alter table public.club_audit_log enable row level security;

drop policy if exists "Managers read club audit log" on public.club_audit_log;
create policy "Managers read club audit log" on public.club_audit_log for select
  using (public.can_manage_club(club_id));

create index if not exists club_audit_log_club_created_idx
  on public.club_audit_log (club_id, created_at desc);

create or replace function public.log_club_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  row_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  row_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_club_id uuid;
  target_id uuid;
begin
  -- Trigger records have the shape of their source table. Using a CASE
  -- expression here still tries to resolve both record fields, so `clubs`
  -- updates fail because that table has no `club_id` column.
  if tg_table_name = 'clubs' then
    target_club_id := coalesce(new.id, old.id);
  else
    target_club_id := coalesce(new.club_id, old.club_id);
  end if;
  target_id := coalesce(new.id, old.id);

  insert into public.club_audit_log (
    club_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    target_club_id, auth.uid(), lower(tg_op), tg_table_name, target_id, row_before, row_after
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clubs', 'club_officers', 'club_advisors', 'club_meetings',
    'club_media', 'club_announcements', 'club_compliance'
  ] loop
    execute format('drop trigger if exists audit_club_change on public.%I', table_name);
    execute format(
      'create trigger audit_club_change after insert or update or delete on public.%I for each row execute function public.log_club_change()',
      table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-media', 'club-media', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads club media files" on storage.objects;
create policy "Public reads club media files" on storage.objects for select
  using (bucket_id = 'club-media');

drop policy if exists "Managers upload club media files" on storage.objects;
create policy "Managers upload club media files" on storage.objects for insert
  with check (
    bucket_id = 'club-media'
    and public.can_manage_club(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "Managers delete club media files" on storage.objects;
create policy "Managers delete club media files" on storage.objects for delete
  using (
    bucket_id = 'club-media'
    and public.can_manage_club(((storage.foldername(name))[1])::uuid)
  );
