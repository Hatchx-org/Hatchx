-- Adds Admin-editable Support FAQs and Help Guide content.
begin;

alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content add constraint site_content_key_check check (
  key in ('home_intro','about_intro','support_intro','footer_note','support_faqs','manual_content')
);

insert into public.site_content(key, body)
values
  ('support_faqs', 'Who can I contact about a technical issue? || Submit a Technical Support request below. The support team will respond in the request conversation.\nHow do I track a request? || Open My requests on this page to view its status and replies.'),
  ('manual_content', 'STUDENTS\nSign in with your school account, browse Activities & Clubs, join a Club, follow Updates & Calendar, and track requests from Support.\n\nADVISORS & CLUB OFFICERS\nOpen Manage My Clubs to update Club information, meetings, members, announcements, media, attendance, treasury records, Constitution, and elections.\n\nADMINISTRATORS\nUse Admin to review Club applications, announcements, support requests, accounts, and public content.\n\nNEED HELP?\nSubmit a Support request and continue the conversation from My requests.')
on conflict (key) do nothing;

commit;
