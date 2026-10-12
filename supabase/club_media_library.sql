-- Club media library, placements, and announcement image review.
-- Apply after core_platform.sql and account_roles_and_review.sql.

begin;

alter table public.club_media add column if not exists visibility text;
update public.club_media set visibility = 'gallery' where visibility is null;
alter table public.club_media alter column visibility set default 'private';
alter table public.club_media alter column visibility set not null;
alter table public.club_media drop constraint if exists club_media_visibility_check;
alter table public.club_media add constraint club_media_visibility_check check (visibility in ('private', 'gallery'));
alter table public.club_media add column if not exists is_cover boolean not null default false;
create unique index if not exists club_media_one_cover_idx on public.club_media (club_id) where is_cover;

alter table public.club_announcements add column if not exists media_id uuid references public.club_media(id) on delete restrict;
alter table public.school_announcement_submissions add column if not exists media_id uuid references public.club_media(id) on delete restrict;
alter table public.announcements add column if not exists media_id uuid references public.club_media(id) on delete restrict;

drop policy if exists "Public reads club media" on public.club_media;
create policy "Public reads club media" on public.club_media for select using (
  public.can_manage_club(club_media.club_id)
  or exists (select 1 from public.clubs c where c.id = club_media.club_id and c.status = 'published')
  and (
    club_media.visibility = 'gallery' or club_media.is_cover
    or exists (select 1 from public.club_announcements ca where ca.media_id = club_media.id and ca.published)
    or exists (select 1 from public.announcements a where a.media_id = club_media.id and a.published)
  )
);

drop policy if exists "Club leaders submit for review" on public.school_announcement_submissions;
create policy "Club leaders submit for review" on public.school_announcement_submissions for insert with check (
  author_id = auth.uid() and public.can_manage_club(club_id) and status = 'pending'
  and reviewed_by is null and reviewed_at is null and announcement_id is null and review_note is null
  and (school_announcement_submissions.media_id is null or exists (
    select 1 from public.club_media m
    where m.id = school_announcement_submissions.media_id and m.club_id = school_announcement_submissions.club_id
  ))
);

create or replace function public.review_school_announcement(p_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare submission public.school_announcement_submissions; published_id uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  select * into submission from public.school_announcement_submissions where id=p_id for update;
  if not found or submission.status <> 'pending' then raise exception 'Submission is no longer pending'; end if;
  if not p_approve and char_length(btrim(coalesce(p_note,''))) < 3 then raise exception 'Give a rejection reason'; end if;
  if submission.media_id is not null and not exists (
    select 1 from public.club_media m where m.id = submission.media_id and m.club_id = submission.club_id
  ) then raise exception 'Selected image is no longer available'; end if;
  if p_approve then
    insert into public.announcements(title,body,tag,created_by,published,media_id)
    values(submission.title,submission.body,'Announcements',submission.author_id,true,submission.media_id)
    returning id into published_id;
  end if;
  update public.school_announcement_submissions
  set status=case when p_approve then 'approved' else 'rejected' end,
      reviewed_by=auth.uid(),reviewed_at=now(),review_note=left(p_note,2000),announcement_id=published_id
  where id=p_id;
end $$;

revoke all on function public.review_school_announcement(uuid,boolean,text) from public,anon;
grant execute on function public.review_school_announcement(uuid,boolean,text) to authenticated;

commit;
