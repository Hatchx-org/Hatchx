-- Per-Club public profile hero colors.
-- Apply after club_profile_tags_club101.sql.
begin;

alter table public.clubs add column if not exists profile_background_color text not null default '#f0ebe5';
alter table public.clubs add column if not exists profile_accent_color text not null default '#97b4de';

alter table public.clubs drop constraint if exists clubs_profile_background_color_check;
alter table public.clubs add constraint clubs_profile_background_color_check check(profile_background_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.clubs drop constraint if exists clubs_profile_accent_color_check;
alter table public.clubs add constraint clubs_profile_accent_color_check check(profile_accent_color ~ '^#[0-9A-Fa-f]{6}$');

commit;
