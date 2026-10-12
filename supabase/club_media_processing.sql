-- Processed image variants, accessibility requirements, and sharing permission records.
-- Apply after club_media_library.sql.
begin;

alter table public.club_media add column if not exists medium_path text;
alter table public.club_media add column if not exists thumbnail_path text;
alter table public.club_media add column if not exists image_width integer check (image_width is null or image_width between 1 and 12000);
alter table public.club_media add column if not exists image_height integer check (image_height is null or image_height between 1 and 12000);
alter table public.club_media add column if not exists file_size integer check (file_size is null or file_size between 1 and 4194304);
alter table public.club_media add column if not exists permission_basis text
  check (permission_basis is null or permission_basis in ('no_people','school_approved','participant_consent','guardian_consent','legacy_review_required'));
alter table public.club_media add column if not exists permission_note text check (char_length(permission_note) <= 500);
alter table public.club_media add column if not exists permission_confirmed_by uuid references public.profiles(id) on delete set null;
alter table public.club_media add column if not exists permission_confirmed_at timestamptz;

-- Existing public media remains available, but is clearly marked for review.
update public.club_media
set permission_basis = 'legacy_review_required'
where permission_basis is null and (visibility = 'gallery' or is_cover);

create or replace function public.validate_club_media_publication()
returns trigger language plpgsql set search_path=public as $$
begin
  -- Allow an existing unverified cover to be demoted without treating that
  -- safety improvement as a new publication. Any other edit must add evidence.
  if tg_op = 'UPDATE' and old.permission_basis = 'legacy_review_required'
     and new.permission_basis = 'legacy_review_required'
     and old.is_cover and not new.is_cover and new.visibility = old.visibility then
    return new;
  end if;
  if new.visibility = 'gallery' or new.is_cover then
    if char_length(btrim(coalesce(new.alt_text,''))) < 10
       or lower(btrim(new.alt_text)) in ('image','photo','picture','club photo','club image','untitled') then
      raise exception 'Public images require meaningful alternative text' using errcode='23514';
    end if;
    if new.permission_basis not in ('no_people','school_approved','participant_consent','guardian_consent')
       or new.permission_confirmed_by is null or new.permission_confirmed_at is null then
      raise exception 'Public images require a confirmed sharing permission record' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists club_media_publication_guard on public.club_media;
create trigger club_media_publication_guard before insert or update on public.club_media
for each row execute function public.validate_club_media_publication();

commit;
