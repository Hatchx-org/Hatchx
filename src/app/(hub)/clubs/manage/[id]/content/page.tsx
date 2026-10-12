import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import ActionFeedbackForm from "@/components/action-feedback-form";
import Pagination from "@/components/pagination";
import { editClubMeeting, deleteClubMeeting, editClubPost, deleteClubPost } from "../../actions";
import { bellPeriodFromStartTime, bellPeriods } from "@/lib/bell-schedule";

const field = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-content-bg px-3 py-2 text-ink";
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const pageSize = 20;

function RecordFields({ clubId, id }: { clubId: string; id: string }) {
  return <><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="record_id" value={id} /></>;
}

/** Paginated content editor: current scoped access is checked again by every action. */
export default async function ClubContentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/clubs/manage/${id}/content`)}`);
  const db = await createServerClient();
  const access = await db.rpc("can_manage_club", { p_club_id: id });
  if (access.error) return <p role="alert" className="p-8">Unable to verify club access. Please try again or contact Support.</p>;
  if (!access.data) redirect("/clubs/manage");
  const { data: club } = await db.from("clubs").select("id,name").eq("id", id).maybeSingle();
  if (!club) notFound();
  const search = await searchParams;
  const tab = search.tab === "posts" ? "posts" : "meetings";
  const number = Number(search.page ?? "1");
  const page = Number.isSafeInteger(number) && number > 0 && number <= 10000 ? number : 1;
  const from = (page - 1) * pageSize;
  const meetings = tab === "meetings" ? await db.from("club_meetings").select("*", { count: "exact" }).eq("club_id", id).order("day_of_week").order("id").range(from, from + pageSize - 1) : null;
  const posts = tab === "posts" ? await db.from("club_announcements").select("*", { count: "exact" }).eq("club_id", id).order("created_at", { ascending: false }).order("id").range(from, from + pageSize - 1) : null;
  const result = meetings ?? posts;
  const basePath = `/clubs/manage/${id}/content`;
  return <div className="mx-auto max-w-4xl space-y-6 px-5 py-8 text-ink">
    <Link href={`/clubs/manage/${id}`} className="text-powder">← {club.name} management</Link>
    <h1 className="text-3xl font-bold">Meetings & club posts</h1>
    <p>Edit existing content below. Add new meetings and posts on the main management page. School-wide announcements have a separate administrator review process.</p>
    <nav aria-label="Content type" className="flex gap-3">{["meetings", "posts"].map(type => <Link key={type} href={`${basePath}?tab=${type}`} aria-current={tab === type ? "page" : undefined} className={`rounded-full px-5 py-2 capitalize ${tab === type ? "bg-navy text-cream" : "border border-line"}`}>{type}</Link>)}</nav>
    {result?.error ? <p role="alert">Content could not be loaded. No changes were made.</p> : <>
      {!result?.data?.length && <p>No records on this page. <Link href={`${basePath}?tab=${tab}`} className="underline">Go to first page</Link>.</p>}
      {meetings?.data?.map(meeting => <details key={meeting.id} className="rounded-xl border border-line bg-card p-5">
        <summary className="cursor-pointer break-words font-semibold">{weekdays[meeting.day_of_week - 1]} · {bellPeriodFromStartTime(meeting.start_time)?.period ? `Period ${bellPeriodFromStartTime(meeting.start_time)?.period}` : "Period TBD"} · {meeting.location ?? "Location TBD"}</summary>
        <ActionFeedbackForm action={editClubMeeting} className="mt-5 grid gap-3">
          <RecordFields clubId={id} id={meeting.id} />
          <label>Weekday<select name="day_of_week" defaultValue={meeting.day_of_week} className={field}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label>
          <label>Period<select name="period" defaultValue={bellPeriodFromStartTime(meeting.start_time)?.period ?? 1} className={field}>{bellPeriods.map((period) => <option key={period.period} value={period.period}>Period {period.period} · {period.start}–{period.end}</option>)}</select></label>
          <label>Location<input name="location" maxLength={240} defaultValue={meeting.location ?? ""} className={field} /></label>
          <label>Recurrence note<input name="recurrence_note" maxLength={500} defaultValue={meeting.recurrence_note ?? ""} className={field} /></label>
          <button className="min-h-11 rounded-full bg-navy px-5 text-cream">Save meeting</button>
        </ActionFeedbackForm>
        <ActionFeedbackForm action={deleteClubMeeting} className="mt-5 grid gap-3 border-t border-line pt-4"><RecordFields clubId={id} id={meeting.id} /><label className="flex gap-2 text-sm"><input required type="checkbox" name="confirm" value="yes" />Delete this recurring meeting from the club and calendar.</label><button className="min-h-11 justify-self-start rounded-full border border-line px-5">Delete meeting</button></ActionFeedbackForm>
      </details>)}
      {posts?.data?.map(post => <details key={post.id} className="rounded-xl border border-line bg-card p-5">
        <summary className="cursor-pointer break-words font-semibold">{post.title} · {post.published ? "Published" : "Hidden"}</summary>
        <ActionFeedbackForm action={editClubPost} className="mt-5 grid gap-3"><RecordFields clubId={id} id={post.id} />
          <label>Title<input name="title" required minLength={3} maxLength={120} defaultValue={post.title} className={field} /></label>
          <label>Post<textarea name="body" required minLength={3} maxLength={4000} defaultValue={post.body} rows={6} className={field} /></label>
          <label className="flex gap-2"><input type="checkbox" name="published" defaultChecked={post.published} />Show on the club page</label>
          <button className="min-h-11 rounded-full bg-navy px-5 text-cream">Save post</button>
        </ActionFeedbackForm>
        <ActionFeedbackForm action={deleteClubPost} className="mt-5 grid gap-3 border-t border-line pt-4"><RecordFields clubId={id} id={post.id} /><p className="text-sm">Uncheck “Show on the club page” to hide the post without deleting it.</p><label className="flex gap-2 text-sm"><input required type="checkbox" name="confirm" value="yes" />Permanently delete this club post.</label><button className="min-h-11 justify-self-start rounded-full border border-line px-5">Delete post</button></ActionFeedbackForm>
      </details>)}
      <Pagination basePath={basePath} page={page} total={result?.count ?? 0} pageSize={pageSize} query={{ tab }} />
    </>}
  </div>;
}
