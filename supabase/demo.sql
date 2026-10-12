-- Optional, current project only. No auth users, memberships or real posts created.
-- Drafts are not publicly browsable. Publish intentionally from Admin to test joining.
begin;
insert into public.clubs(slug,name,short_description,interest_tags,join_policy,status)
values
 ('bhs-demo-permissions-a','[DEMO] Permissions Lab A','DEMO ONLY — permissions, announcements, chat and photo testing. Not an official club.',array['DEMO'],'approval_required','draft'),
 ('bhs-demo-permissions-b','[DEMO] Permissions Lab B','DEMO ONLY — cross-club access denial tests. Not an official club.',array['DEMO'],'approval_required','draft')
on conflict(slug) do nothing;
commit;
