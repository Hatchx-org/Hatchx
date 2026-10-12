-- Run after site_cms_content.sql and custom_permissions.sql.
begin;

create table if not exists public.site_content_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null references public.site_content(key) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.site_content_drafts enable row level security;
drop policy if exists "Editors own site drafts" on public.site_content_drafts;
create policy "Editors own site drafts" on public.site_content_drafts for all
using (user_id = auth.uid() and (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null)))
with check (user_id = auth.uid() and (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null)));
grant select,insert,update,delete on public.site_content_drafts to authenticated;

create table if not exists public.site_content_scheduled (
  key text primary key references public.site_content(key) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  publish_at timestamptz not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_content_scheduled enable row level security;
drop policy if exists "Public reads due site content" on public.site_content_scheduled;
drop policy if exists "Editors manage site schedule" on public.site_content_scheduled;
create policy "Public reads due site content" on public.site_content_scheduled for select using (publish_at <= now());
create policy "Editors manage site schedule" on public.site_content_scheduled for all
using (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null))
with check (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null));
grant select on public.site_content_scheduled to anon,authenticated;
grant insert,update,delete on public.site_content_scheduled to authenticated;
drop trigger if exists site_content_scheduled_audit on public.site_content_scheduled;
create trigger site_content_scheduled_audit after insert or update or delete on public.site_content_scheduled
for each row execute function public.audit_management_change();

create table if not exists public.site_content_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null references public.site_content(key) on delete cascade,
  version_number integer not null,
  snapshot_body text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (key, version_number)
);
alter table public.site_content_versions enable row level security;
drop policy if exists "Editors read site versions" on public.site_content_versions;
create policy "Editors read site versions" on public.site_content_versions for select
using (public.is_staff_or_admin() or public.has_custom_permission('site.manage',null));
grant select on public.site_content_versions to authenticated;
insert into public.site_content_versions(key,version_number,snapshot_body,changed_by)
select key,1,body,updated_by from public.site_content
on conflict (key,version_number) do nothing;

create or replace function public.capture_site_content_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  insert into public.site_content_versions(key,version_number,snapshot_body,changed_by)
  values(new.key,(select coalesce(max(version_number),0)+1 from public.site_content_versions where key=new.key),new.body,new.updated_by);
  return new;
end;
$$;
drop trigger if exists site_content_version_history on public.site_content;
create trigger site_content_version_history after insert or update on public.site_content
for each row execute function public.capture_site_content_version();

create or replace function public.capture_site_schedule_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  insert into public.site_content_versions(key,version_number,snapshot_body,changed_by)
  values(new.key,(select coalesce(max(version_number),0)+1 from public.site_content_versions where key=new.key),new.body,new.updated_by);
  return new;
end;
$$;
drop trigger if exists site_schedule_version_history on public.site_content_scheduled;
create trigger site_schedule_version_history after insert or update on public.site_content_scheduled
for each row execute function public.capture_site_schedule_version();

commit;
