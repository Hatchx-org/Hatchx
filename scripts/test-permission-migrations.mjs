/** Isolated PostgreSQL checks. No network, Supabase credentials or production writes.
 * Optional test runtime: point PGLITE_MODULE at a locally installed PGlite module.
 * This reproduces database roles, not Auth email delivery, Storage HTTP or Realtime.
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
let checks = 0;
async function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  console.log(`PASS ${++checks}: ${label}`);
}
async function value(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
async function asUser(id, callback) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  try { return await callback(); }
  finally { await db.exec("reset role"); await db.exec("select set_config('request.jwt.claim.sub','',false)"); }
}
async function denied(callback, label) {
  await assert.rejects(callback);
  console.log(`PASS ${++checks}: ${label}`);
}
try {
  // Supabase-owned infrastructure is represented only by its SQL interfaces.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    grant usage on schema public,auth,storage to anon,authenticated;
    alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
    create publication supabase_realtime;
  `);
  const baseline = ["profiles", "admin_crud", "member_actions", "security_hardening", "core_platform", "club_governance", "release_security_hardening", "club_communication"];
  const added = ["account_roles_and_review", "custom_permissions", "chat_recent_messages", "club_custom_tables", "club_custom_tables_enhancements", "demo_clubs"];
  for (const name of [...baseline, ...added]) {
    await db.exec(await readFile(new URL(`../supabase/${name}.sql`, import.meta.url), "utf8"));
    console.log(`Applied ${name}`);
  }
  for (const name of added) await db.exec(await readFile(new URL(`../supabase/${name}.sql`, import.meta.url), "utf8"));
  await equal(await value("select count(*)::int from clubs where slug like 'bhs-demo-permissions-%'"), 2, "new migrations and DEMO seed are repeatable");
  const ids = Object.fromEntries(["admin", "staff", "advisor", "board", "student", "editor", "teacher"].map((role, i) => [role, `10000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`]));
  for (const [role, id] of Object.entries(ids)) {
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [id, `${role}@${role === "teacher" ? "schools.nyc.gov" : "nycstudents.net"}`, { full_name: role, role: "admin" }]);
  }
  await equal(await value("select role from profiles where id=$1", [ids.student]), "student", "signup ignores self-requested admin metadata");
  await equal(await value("select role from profiles where id=$1", [ids.teacher]), "teacher", "school staff domain receives Teacher, not Advisor");
  await db.query("update profiles set role='admin' where id=$1", [ids.admin]);
  const clubA = await value("select id from clubs where slug='bhs-demo-permissions-a'");
  const clubB = await value("select id from clubs where slug='bhs-demo-permissions-b'");
  await db.query("update clubs set status='published' where id in ($1,$2)", [clubA, clubB]);
  await asUser(ids.admin, async () => {
    await denied(() => db.query("select assign_account_role($1,'student',null)", [ids.admin]), "last Admin cannot be demoted");
    await denied(() => db.query("select assign_account_role($1,'advisor',null)", [ids.advisor]), "Advisor assignment requires a club");
    await db.query("select assign_account_role($1,'advisor',$2)", [ids.advisor, clubA]);
    await db.query("select assign_account_role($1,'staff',null)", [ids.staff]);
  });
  await db.query("insert into club_memberships(club_id,profile_id,status) values($1,$2,'active'),($1,$3,'active')", [clubA, ids.student, ids.board]);
  await db.query("insert into club_officers(club_id,profile_id,title) values($1,$2,'DEMO Board')", [clubA, ids.board]);
  for (const role of ["student", "board", "advisor", "staff", "admin"]) {
    await asUser(ids[role], async () => {
      await equal(await value("select can_manage_club($1)", [clubA]), role !== "student", `${role}: correct Lab A content permission`);
      await equal(await value("select can_manage_club($1)", [clubB]), ["staff", "admin"].includes(role), `${role}: correct cross-club boundary`);
      if (role !== "admin") await denied(() => db.query("select assign_account_role($1,'admin',null)", [ids[role]]), `${role}: cannot grant Admin`);
    });
  }
  const tableColumns = [{ key: "column_1", label: "Name", type: "text", required: true }, { key: "column_2", label: "Hours", type: "number", required: false }];
  let customTableA;
  let customRowA;
  await asUser(ids.board, async () => {
    customTableA = await value("insert into club_custom_tables(club_id,name,columns,created_by) values($1,'Volunteer hours',$2,$3) returning id", [clubA, JSON.stringify(tableColumns), ids.board]);
    customRowA = await value("insert into club_custom_table_rows(table_id,data,created_by) values($1,$2,$3) returning id", [customTableA, JSON.stringify({ column_1: "Student A", column_2: 3.5 }), ids.board]);
    await equal((await db.query("update club_custom_table_rows set data=$1,updated_by=$2 where id=$3 returning id", [JSON.stringify({ column_1: "Student A", column_2: 4 }), ids.board, customRowA])).rows.length, 1, "Board edits its own Club custom table row");
    await equal(await value("select count(*)::int from club_custom_table_rows where table_id=$1", [customTableA]), 1, "Board manages its own Club custom table");
  });
  let customTableB;
  await asUser(ids.admin, async () => {
    customTableB = await value("insert into club_custom_tables(club_id,name,columns,created_by) values($1,'Other Club data',$2,$3) returning id", [clubB, JSON.stringify(tableColumns), ids.admin]);
  });
  await asUser(ids.student, async () => {
    await equal(await value("select count(*)::int from club_custom_tables where id=$1", [customTableA]), 0, "ordinary Student cannot read Club custom tables");
    await denied(() => db.query("insert into club_custom_table_rows(table_id,data,created_by) values($1,$2,$3)", [customTableA, JSON.stringify({ column_1: "Bypass" }), ids.student]), "ordinary Student cannot add custom table rows");
    await equal((await db.query("update club_custom_table_rows set data=$1,updated_by=$2 where id=$3 returning id", [JSON.stringify({ column_1: "Bypass" }), ids.student, customRowA])).rows.length, 0, "ordinary Student cannot edit custom table rows");
  });
  await asUser(ids.board, async () => {
    await equal(await value("select count(*)::int from club_custom_tables where id=$1", [customTableB]), 0, "Club board cannot discover another Club's custom tables");
    await denied(() => db.query("insert into club_custom_table_rows(table_id,data,created_by) values($1,$2,$3)", [customTableA, JSON.stringify({ unknown: "field" }), ids.board]), "database rejects unknown custom columns");
  });
  await asUser(ids.student, async () => {
    await denied(() => db.query("update profiles set role='admin' where id=$1", [ids.student]), "direct profile role update blocked");
    await equal((await db.query("update clubs set name='Unauthorized' where id=$1 returning id", [clubA])).rows.length, 0, "Student cannot update a club through RLS");
    await denied(() => db.query("insert into school_announcement_submissions(club_id,author_id,title,body) values($1,$2,'Demo','Demo body')", [clubA, ids.student]), "ordinary members cannot submit school announcements");
    await denied(() => db.query("select * from get_club_chat_messages($1)", [clubB]), "non-member cannot read another club's chat");
  });
  // Meeting and post edits/deletes use the same RLS boundary as the UI actions.
  const meetingA = await value("insert into club_meetings(club_id,day_of_week,location) values($1,2,'Room A') returning id", [clubA]);
  const meetingB = await value("insert into club_meetings(club_id,day_of_week,location) values($1,3,'Room B') returning id", [clubB]);
  const postA = await value("insert into club_announcements(club_id,title,body,published_by) values($1,'Club test','Original post',$2) returning id", [clubA, ids.board]);
  const postB = await value("insert into club_announcements(club_id,title,body,published_by) values($1,'Other club','Unchanged post',$2) returning id", [clubB, ids.admin]);
  await asUser(ids.board, async () => {
    await equal((await db.query("update club_meetings set location='Updated room' where id=$1 and club_id=$2 returning id", [meetingA, clubA])).rows.length, 1, "Board edits own club meeting");
    await equal((await db.query("update club_meetings set location='Forbidden' where id=$1 returning id", [meetingB])).rows.length, 0, "Board cannot edit another club meeting");
    await equal((await db.query("delete from club_meetings where id=$1 returning id", [meetingB])).rows.length, 0, "Board cannot delete another club meeting");
    await equal((await db.query("update club_announcements set body='Edited post',published=false where id=$1 and club_id=$2 returning id", [postA, clubA])).rows.length, 1, "Board edits and hides own club post");
    await equal((await db.query("update club_announcements set body='Forbidden' where id=$1 returning id", [postB])).rows.length, 0, "Board cannot edit another club post");
    await equal((await db.query("delete from club_announcements where id=$1 returning id", [postB])).rows.length, 0, "Board cannot delete another club post");
  });
  await asUser(ids.student, async () => {
    await equal((await db.query("select id from club_announcements where id=$1", [postA])).rows.length, 0, "hidden post is not visible to ordinary members");
    await equal((await db.query("delete from club_meetings where id=$1 returning id", [meetingA])).rows.length, 0, "Student cannot delete meeting");
  });
  await asUser(ids.board, async () => {
    await equal((await db.query("delete from club_meetings where id=$1 and club_id=$2 returning id", [meetingA, clubA])).rows.length, 1, "Board deletes own club meeting");
    await equal((await db.query("delete from club_announcements where id=$1 and club_id=$2 returning id", [postA, clubA])).rows.length, 1, "Board deletes own club post");
  });
  await equal(await value("select count(*)::int from club_audit_log where entity_id=$1 and action='delete' and before_data->>'location'='Updated room' and actor_id=$2", [meetingA, ids.board]), 1, "deleted meeting retains audit before-image and actor");
  await equal(await value("select count(*)::int from club_audit_log where entity_id=$1 and action='delete' and before_data->>'body'='Edited post' and actor_id=$2", [postA, ids.board]), 1, "deleted post retains audit before-image and actor");
  let submission;
  await asUser(ids.board, async () => {
    await denied(() => db.query("update clubs set status='archived' where id=$1", [clubA]), "Board cannot change club publication through direct API");
    submission = await value("insert into school_announcement_submissions(club_id,author_id,title,body) values($1,$2,'Demo review','Demo body') returning id", [clubA, ids.board]);
    await denied(() => db.query("select review_school_announcement($1,true,'')", [submission]), "Board cannot approve own submission");
    await denied(() => db.query("insert into school_announcement_submissions(club_id,author_id,title,body,status) values($1,$2,'Bypass','Demo body','approved')", [clubA, ids.board]), "RLS prevents directly inserting approved submissions");
  });
  await equal(await value("select count(*)::int from announcements where title='Demo review'"), 0, "pending submission not published");
  await asUser(ids.admin, async () => {
    await db.query("select review_school_announcement($1,true,'Approved')", [submission]);
    await db.query("update clubs set status='draft' where id=$1", [clubB]);
    await equal(await value("select status from clubs where id=$1", [clubB]), "draft", "Admin can change club publication");
    await denied(() => db.query("select review_school_announcement($1,true,'Approved')", [submission]), "repeat review cannot publish twice");
  });
  await equal(await value("select count(*)::int from announcements where title='Demo review'"), 1, "approval publishes exactly one announcement");
  let customRole;
  await asUser(ids.admin, async () => {
    customRole = await value("insert into custom_roles(name,permissions) values('DEMO editor',array['clubs.govern']) returning id");
    await db.query("insert into custom_role_assignments(role_id,profile_id,club_id) values($1,$2,$3)", [customRole, ids.editor, clubA]);
  });
  await asUser(ids.editor, async () => {
    await equal(await value("select can_govern_club($1)", [clubA]), true, "scoped custom governance works");
    await equal(await value("select can_govern_club($1)", [clubB]), false, "custom role does not escape its scope");
    await equal(await value("select can_view_member_profile($1)", [ids.student]), true, "custom governor can read their club roster");
    await equal((await db.query("select * from get_managed_club_ids()")).rows.length, 1, "managed club list respects scoped role");
    await denied(() => db.exec("insert into site_content(key,body) values('home_intro','Unauthorized')"), "club governance does not imply site editing");
  });
  await asUser(ids.admin, async () => {
    await db.query("delete from custom_role_assignments where role_id=$1", [customRole]);
    await db.query("update custom_roles set permissions=array['site.manage'] where id=$1", [customRole]);
    await db.query("insert into custom_role_assignments(role_id,profile_id) values($1,$2)", [customRole, ids.editor]);
  });
  await asUser(ids.editor, async () => {
    await equal(await value("select can_manage_club($1)", [clubA]), false, "revoked club grant stops working immediately");
    await db.query("insert into site_content(key,body,updated_by) values('home_intro','DEMO text',$1)", [ids.editor]);
    await equal(await value("select count(*)::int from management_audit"), 0, "editor cannot read Admin audit");
  });
  await equal(await value("select count(*)::int from management_audit where resource='site_content' and actor_id=$1", [ids.editor]), 1, "public text write produces immutable actor evidence");
  await asUser(ids.student, async () => {
    await denied(() => db.exec("insert into management_audit(resource,operation) values('spoof','INSERT')"), "client cannot forge audit rows");
  });
  await db.query("insert into club_messages(club_id,author_id,body,created_at) select $1,$2,'Message '||i,now()+i*interval '1 second' from generate_series(1,105)i", [clubA, ids.student]);
  await asUser(ids.student, async () => {
    const messages = (await db.query("select * from get_club_chat_messages($1,100)", [clubA])).rows;
    await equal([messages.length,messages[0].body,messages.at(-1).body], [100,"Message 6","Message 105"], "chat returns newest 100 messages in reading order");
  });
  await asUser(ids.admin, () => db.query("select assign_account_role($1,'teacher',null)", [ids.advisor]));
  await asUser(ids.advisor, async () => equal(await value("select can_manage_club($1)", [clubA]), false, "demoted Advisor loses their club assignment"));
  console.log(`Completed ${checks} isolated database checks. Production integration still requires manual validation.`);
} finally { await db.close(); }
