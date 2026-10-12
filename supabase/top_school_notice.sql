-- Editable, switchable global school notice. Run after site_cms_content.sql.
begin;

alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content drop constraint if exists site_content_body_check;
alter table public.site_content add constraint site_content_key_check check (key in (
  'site_name','home_title','home_intro','home_cta_label',
  'about_intro','about_heading','about_body',
  'about_card_1_title','about_card_1_body','about_card_2_title','about_card_2_body','about_card_3_title','about_card_3_body',
  'support_heading','support_intro','support_response_time','support_location','support_faqs','manual_content',
  'footer_note','footer_contact','school_notice_enabled','school_notice_text','school_notice_background','school_notice_text_color'
));
alter table public.site_content add constraint site_content_body_check check (
  char_length(body) <= 4000 and (char_length(body) >= 1 or key in ('support_location','footer_contact','school_notice_text'))
);

insert into public.site_content(key, body) values
  ('school_notice_enabled','true'),
  ('school_notice_text','No clubs may meet on October 14th or 15th due to the Fall Open House, and no unsupervised clubs may meet on floors 2, 3, and 4 on October 8th and October 22nd due to PSAT preparations.'),
  ('school_notice_background','#ff8500'),
  ('school_notice_text_color','#101010')
on conflict (key) do nothing;

commit;
