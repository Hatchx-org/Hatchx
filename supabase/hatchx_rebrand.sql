-- One-time public brand migration. Preserve administrator-customized content.
update public.site_content
set body = 'Hatchx', updated_at = now()
where key = 'site_name' and body = 'Bayside' || ' Hub';

update public.site_content
set body = replace(body, 'Bayside' || ' Hub', 'Hatchx'), updated_at = now()
where key in ('about_intro', 'about_body')
  and body like '%Bayside' || ' Hub%';

update public.site_content set body = 'Hatchx brings the people, possibilities, and momentum of Bayside High School into one student-built platform.', updated_at = now() where key = 'about_intro' and body = 'Hatchx is Bayside High School''s one-stop platform for activities, clubs, events, and opportunities.';
update public.site_content set body = 'Opportunity was everywhere. Access was not.', updated_at = now() where key = 'about_heading' and body = 'Anchored in Excellence';
update public.site_content set body = 'Clubs had energy. Events had potential. Students wanted to participate. But the path between them was fragmented across flyers, links, announcements, and conversations. Hatchx was created to close that gap—turning scattered information into a clear invitation to take part.', updated_at = now() where key = 'about_body' and body like 'Hatchx is Bayside High School%';
update public.site_content set body = 'Student first', updated_at = now() where key = 'about_card_1_title' and body = 'Everything in one place';
update public.site_content set body = 'Every decision begins with a simple question: does this make school life easier to navigate?', updated_at = now() where key = 'about_card_1_body' and body = 'Announcements, club listings, calendars, and opportunities — a single source of truth for school life.';
update public.site_content set body = 'Open by design', updated_at = now() where key = 'about_card_2_title' and body = 'Built by students';
update public.site_content set body = 'Opportunity should be visible. Clear information helps more students find where they belong.', updated_at = now() where key = 'about_card_2_body' and body = 'Developed and maintained by the Bayside student dev team, guided by advisors and the S.O. office.';
update public.site_content set body = 'Built to last', updated_at = now() where key = 'about_card_3_title' and body = 'Open to every Baysider';
update public.site_content set body = 'Hatchx turns student energy into systems future classes can continue, improve, and trust.', updated_at = now() where key = 'about_card_3_body' and body = 'Every Baysider can browse, join clubs, and find opportunities with their NYC school account.';
