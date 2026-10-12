-- Repeatable public links replace the single Google Classroom code field.
create table if not exists public.club_links (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  platform text not null check(platform in ('google_classroom','instagram','discord','whatsapp','youtube','tiktok','website','other')),
  label text not null check(char_length(btrim(label)) between 1 and 80),
  value text not null check(char_length(btrim(value)) between 1 and 500),
  sort_order integer not null default 0 check(sort_order between 0 and 10000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists club_links_club_order_idx on public.club_links(club_id,sort_order,created_at);
alter table public.club_links enable row level security;
drop policy if exists "Public reads published Club links" on public.club_links;
create policy "Public reads published Club links" on public.club_links for select using(exists(select 1 from public.clubs c where c.id=club_id and (c.status='published' or public.can_manage_club(c.id))));
drop policy if exists "Managers manage Club links" on public.club_links;
create policy "Managers manage Club links" on public.club_links for all using(public.can_manage_club(club_id)) with check(public.can_manage_club(club_id));
grant select on public.club_links to anon,authenticated;
grant insert,update,delete on public.club_links to authenticated;

-- Preserve existing Classroom codes as the first repeatable link.
insert into public.club_links(club_id,platform,label,value,sort_order,created_by)
select id,'google_classroom','Google Classroom',google_classroom_code,0,created_by
from public.clubs c where nullif(btrim(c.google_classroom_code),'') is not null
and not exists(select 1 from public.club_links l where l.club_id=c.id and l.platform='google_classroom' and l.value=c.google_classroom_code);
