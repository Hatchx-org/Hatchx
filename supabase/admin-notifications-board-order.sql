-- Administrator notification broadcasts and explicit Club board ordering.
-- Safe to rerun after the current schema.sql.
begin;

alter table public.club_officers
  add column if not exists sort_order integer not null default 0;

alter table public.club_officers
  drop constraint if exists club_officers_sort_order_check;
alter table public.club_officers
  add constraint club_officers_sort_order_check
  check(sort_order between 0 and 100000);

-- Give legacy rows a stable initial order without resetting Clubs already reordered.
with unranked_clubs as (
  select club_id
  from public.club_officers
  group by club_id
  having count(*) > 1 and count(*) filter(where sort_order<>0)=0
), ranked as (
  select officer.id,row_number() over(
    partition by officer.club_id
    order by lower(officer.title),officer.created_at,officer.id
  )*10 as next_order
  from public.club_officers officer
  join unranked_clubs using(club_id)
)
update public.club_officers officer
set sort_order=ranked.next_order
from ranked
where officer.id=ranked.id;

create index if not exists club_officers_order_idx
  on public.club_officers(club_id,sort_order,created_at);

create or replace function public.move_club_officer(
  p_officer_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  target public.club_officers;
  neighbor public.club_officers;
begin
  if p_direction not in ('up','down') then
    raise exception 'Direction must be up or down' using errcode='22023';
  end if;

  select * into target from public.club_officers where id=p_officer_id for update;
  if target.id is null then raise exception 'Board position not found' using errcode='P0002'; end if;
  if not public.can_govern_club(target.club_id) then
    raise exception 'Club governance permission required' using errcode='42501';
  end if;

  if p_direction='up' then
    select * into neighbor
    from public.club_officers
    where club_id=target.club_id and id<>target.id
      and (sort_order<target.sort_order or (sort_order=target.sort_order and created_at<target.created_at))
    order by sort_order desc,created_at desc,id desc limit 1 for update;
  else
    select * into neighbor
    from public.club_officers
    where club_id=target.club_id and id<>target.id
      and (sort_order>target.sort_order or (sort_order=target.sort_order and created_at>target.created_at))
    order by sort_order,created_at,id limit 1 for update;
  end if;

  if neighbor.id is not null then
    update public.club_officers
    set sort_order=case when id=target.id then neighbor.sort_order else target.sort_order end
    where id in (target.id,neighbor.id);
  end if;
end;
$$;
revoke all on function public.move_club_officer(uuid,text) from public,anon;
grant execute on function public.move_club_officer(uuid,text) to authenticated;

create or replace function public.publish_admin_notification(
  p_title text,
  p_body text,
  p_href text default null,
  p_audience text default 'all',
  p_club_id uuid default null,
  p_emergency boolean default false
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  normalized_title text:=btrim(coalesce(p_title,''));
  normalized_body text:=btrim(coalesce(p_body,''));
  normalized_href text:=nullif(btrim(coalesce(p_href,'')),'');
  broadcast_key text:='admin-broadcast:'||gen_random_uuid()::text;
  inserted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Administrator permission required' using errcode='42501';
  end if;
  if char_length(normalized_title) not between 3 and 160
     or char_length(normalized_body) not between 3 and 2000 then
    raise exception 'Invalid notification length' using errcode='23514';
  end if;
  if p_audience not in ('all','students','teachers','admins','club')
     or (p_audience='club' and p_club_id is null)
     or (p_audience<>'club' and p_club_id is not null) then
    raise exception 'Invalid notification audience' using errcode='23514';
  end if;
  if normalized_href is not null and (
    char_length(normalized_href)>500 or left(normalized_href,1)<>'/' or left(normalized_href,2)='//'
  ) then
    raise exception 'Link must be a local Hatchx path' using errcode='23514';
  end if;

  insert into public.notifications(user_id,kind,title,body,href,dedupe_key)
  select profile.id,
    case when p_emergency then 'emergency_announcement' else 'admin_notification' end,
    normalized_title,normalized_body,normalized_href,broadcast_key
  from public.profiles profile
  where case p_audience
    when 'all' then true
    when 'students' then profile.role='student'
    when 'teachers' then profile.role in ('teacher','advisor','staff')
    when 'admins' then profile.role='admin'
    when 'club' then
      exists(select 1 from public.club_memberships member where member.club_id=p_club_id and member.profile_id=profile.id and member.status='active')
      or exists(select 1 from public.club_advisors advisor where advisor.club_id=p_club_id and advisor.profile_id=profile.id)
      or exists(select 1 from public.club_officers officer where officer.club_id=p_club_id and officer.profile_id=profile.id)
    else false end;

  get diagnostics inserted_count=row_count;
  return inserted_count;
end;
$$;
revoke all on function public.publish_admin_notification(text,text,text,text,uuid,boolean) from public,anon;
grant execute on function public.publish_admin_notification(text,text,text,text,uuid,boolean) to authenticated;

commit;
