-- Expiring public QR links for Club fairs and recruitment events.
-- Run after core_platform.sql and custom_permissions.sql.
begin;

create table if not exists public.club_share_links (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 3 and 120),
  expires_at timestamptz not null,
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists club_share_links_club_created_idx
on public.club_share_links(club_id, created_at desc);
create index if not exists club_share_links_public_lookup_idx
on public.club_share_links(id) where active;

alter table public.club_share_links enable row level security;
drop policy if exists "Managers read Club share links" on public.club_share_links;
drop policy if exists "Managers create Club share links" on public.club_share_links;
drop policy if exists "Managers update Club share links" on public.club_share_links;
create policy "Managers read Club share links" on public.club_share_links for select
using(public.can_manage_club(club_id));
create policy "Managers create Club share links" on public.club_share_links for insert
with check(public.can_manage_club(club_id) and created_by=auth.uid());
create policy "Managers update Club share links" on public.club_share_links for update
using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
drop policy if exists "Public opens current Club share links" on public.club_share_links;

-- Public visitors resolve an opaque token without receiving creator or audit data.
create or replace function public.resolve_club_share_link(p_id uuid)
returns table(club_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select link.club_id
  from public.club_share_links link
  join public.clubs club on club.id = link.club_id
  where link.id = p_id
    and link.active
    and link.expires_at > now()
    and club.status = 'published'
  limit 1;
$$;
revoke all on function public.resolve_club_share_link(uuid) from public;
grant execute on function public.resolve_club_share_link(uuid) to anon, authenticated;

grant select on public.club_share_links to authenticated;
grant insert,update on public.club_share_links to authenticated;

drop trigger if exists club_share_links_audit on public.club_share_links;
create trigger club_share_links_audit after insert or update or delete on public.club_share_links
for each row execute function public.audit_management_change();

commit;
