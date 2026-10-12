-- Expands the audited public-content editor beyond the original four snippets.
-- Run after custom_permissions.sql and editable_support_content.sql.
begin;

alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content drop constraint if exists site_content_body_check;
alter table public.site_content add constraint site_content_key_check check (key in (
  'site_name','home_title','home_intro','home_cta_label',
  'about_intro','about_heading','about_body',
  'about_card_1_title','about_card_1_body','about_card_2_title','about_card_2_body','about_card_3_title','about_card_3_body',
  'support_heading','support_intro','support_response_time','support_location','support_faqs','manual_content',
  'footer_note','footer_contact'
));
alter table public.site_content add constraint site_content_body_check check (
  char_length(body) <= 4000 and (char_length(body) >= 1 or key in ('support_location','footer_contact'))
);

insert into public.site_content(key, body) values
  ('site_name','Hatchx'),
  ('home_title','Anchored in Excellence'),
  ('home_cta_label','Explore'),
  ('about_heading','Opportunity was everywhere. Access was not.'),
  ('about_body','Clubs had energy. Events had potential. Students wanted to participate. But the path between them was fragmented across flyers, links, announcements, and conversations. Hatchx was created to close that gap—turning scattered information into a clear invitation to take part.'),
  ('about_card_1_title','Student first'),
  ('about_card_1_body','Every decision begins with a simple question: does this make school life easier to navigate?'),
  ('about_card_2_title','Open by design'),
  ('about_card_2_body','Opportunity should be visible. Clear information helps more students find where they belong.'),
  ('about_card_3_title','Built to last'),
  ('about_card_3_body','Hatchx turns student energy into systems future classes can continue, improve, and trust.'),
  ('support_heading','We are here to help!'),
  ('support_response_time','Average response time: within two school days.'),
  ('support_location','For in-person help, visit the S.O. office in Room 131.'),
  ('footer_contact','')
on conflict (key) do nothing;

drop policy if exists "Manage site content" on public.site_content;
create policy "Manage site content" on public.site_content for all
using(public.is_staff_or_admin() or public.has_custom_permission('site.manage',null))
with check(public.is_staff_or_admin() or public.has_custom_permission('site.manage',null));

-- CMS writes outside announcements should be visible in the management audit.
drop trigger if exists events_global_audit on public.events;
create trigger events_global_audit after insert or update or delete on public.events
for each row execute function public.audit_management_change();
drop trigger if exists opportunities_global_audit on public.opportunities;
create trigger opportunities_global_audit after insert or update or delete on public.opportunities
for each row execute function public.audit_management_change();

commit;
