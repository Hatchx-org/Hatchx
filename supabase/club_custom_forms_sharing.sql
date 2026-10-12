-- Public Custom form links with board-only administration and response access.
-- Run after club_custom_tables.sql and club_custom_tables_enhancements.sql.
begin;

create extension if not exists pgcrypto;

create or replace function public.can_manage_club_forms(p_club_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (
  exists(select 1 from public.club_officers o where o.club_id=p_club_id and o.profile_id=auth.uid()
   and (o.term_start is null or o.term_start<=current_date) and (o.term_end is null or o.term_end>=current_date))
  or exists(select 1 from public.club_advisors a where a.club_id=p_club_id and a.profile_id=auth.uid())
 );
$$;
revoke all on function public.can_manage_club_forms(uuid) from public,anon;
grant execute on function public.can_manage_club_forms(uuid) to authenticated;

alter table public.club_custom_table_rows alter column created_by drop not null;

create table if not exists public.club_custom_form_links(
 id uuid primary key default gen_random_uuid(),
 table_id uuid not null references public.club_custom_tables(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz,
 active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists club_custom_form_links_table_idx on public.club_custom_form_links(table_id,created_at desc);
alter table public.club_custom_form_links enable row level security;
drop policy if exists "Board manages form links" on public.club_custom_form_links;
drop policy if exists "Board reads form links" on public.club_custom_form_links;
drop policy if exists "Board creates form links" on public.club_custom_form_links;
drop policy if exists "Board updates form links" on public.club_custom_form_links;
drop policy if exists "Board deletes form links" on public.club_custom_form_links;
create policy "Board reads form links" on public.club_custom_form_links for select using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board creates form links" on public.club_custom_form_links for insert with check(created_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board updates form links" on public.club_custom_form_links for update using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id))) with check(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board deletes form links" on public.club_custom_form_links for delete using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
grant select,insert,update,delete on public.club_custom_form_links to authenticated;

drop policy if exists "Club managers read custom tables" on public.club_custom_tables;
drop policy if exists "Club managers create custom tables" on public.club_custom_tables;
drop policy if exists "Club managers update custom tables" on public.club_custom_tables;
drop policy if exists "Club managers delete custom tables" on public.club_custom_tables;
create policy "Board reads custom tables" on public.club_custom_tables for select using(public.can_manage_club_forms(club_id));
create policy "Board creates custom tables" on public.club_custom_tables for insert with check(public.can_manage_club_forms(club_id) and created_by=auth.uid());
create policy "Board updates custom tables" on public.club_custom_tables for update using(public.can_manage_club_forms(club_id)) with check(public.can_manage_club_forms(club_id));
create policy "Board deletes custom tables" on public.club_custom_tables for delete using(public.can_manage_club_forms(club_id));

drop policy if exists "Club managers read custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers create custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers update custom rows" on public.club_custom_table_rows;
drop policy if exists "Club managers delete custom rows" on public.club_custom_table_rows;
create policy "Board reads custom rows" on public.club_custom_table_rows for select using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board creates custom rows" on public.club_custom_table_rows for insert with check(created_by=auth.uid() and exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));
create policy "Board updates custom rows" on public.club_custom_table_rows for update using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id))) with check(updated_by=auth.uid());
create policy "Board deletes custom rows" on public.club_custom_table_rows for delete using(exists(select 1 from public.club_custom_tables t where t.id=table_id and public.can_manage_club_forms(t.club_id)));

create or replace function public.get_public_custom_form(p_token text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',t.id,'name',t.name,'description',t.description,'columns',t.columns,'club_name',c.name)
 from public.club_custom_form_links l join public.club_custom_tables t on t.id=l.table_id join public.clubs c on c.id=t.club_id
 where l.token_hash=encode(digest(p_token,'sha256'),'hex') and l.active and (l.expires_at is null or l.expires_at>now())
 limit 1;
$$;

create or replace function public.submit_public_custom_form(p_token text,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_table uuid; result_id uuid;
begin
 select l.table_id into target_table from public.club_custom_form_links l
 where l.token_hash=encode(digest(p_token,'sha256'),'hex') and l.active and (l.expires_at is null or l.expires_at>now()) for update;
 if target_table is null then raise exception 'Form link is invalid or expired' using errcode='P0002'; end if;
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid response' using errcode='23514'; end if;
 insert into public.club_custom_table_rows(table_id,data,created_by) values(target_table,p_data,null) returning id into result_id;
 return result_id;
end $$;
revoke all on function public.get_public_custom_form(text),public.submit_public_custom_form(text,jsonb) from public;
grant execute on function public.get_public_custom_form(text),public.submit_public_custom_form(text,jsonb) to anon,authenticated;

commit;
