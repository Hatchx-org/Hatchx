import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SubmissionForm } from "./forms";
export default async function SubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/announcements/submit");
  const db = await createServerClient();
  const [managed, history] = await Promise.all([
    db.rpc("get_managed_club_ids", {}),
    db.from("school_announcement_submissions").select("*").eq("author_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const ids = managed.data ?? [];
  const { data: clubs } = ids.length ? await db.from("clubs").select("id,name").in("id", ids) : { data: [] };
  const { data: mediaRows } = ids.length ? await db.from("club_media").select("id,club_id,title,alt_text,storage_path").in("club_id", ids).order("created_at", { ascending: false }) : { data: [] };
  const media = (mediaRows ?? []).map((item) => ({ ...item, url: db.storage.from("club-media").getPublicUrl(item.storage_path).data.publicUrl }));
  return <div className="mx-auto max-w-3xl space-y-6 px-5 py-8"><h1 className="text-3xl font-bold">School announcements</h1><p className="text-muted">Advisors and board members can submit a school-wide announcement for administrator approval.</p>{history.error ? <p role="alert">Submissions are temporarily unavailable. Please contact Support.</p> : clubs?.length ? <SubmissionForm clubs={clubs} media={media} /> : <p>No club leadership assignment found. Ask your administrator to assign your club.</p>}<h2 className="text-xl font-semibold">Your submissions</h2>{history.data?.map(row => <article key={row.id} className="rounded-xl border border-line p-5"><h3 className="font-bold">{row.title}</h3><p className="text-sm capitalize">{row.status}</p>{row.review_note && <p>{row.review_note}</p>}</article>)}</div>;
}
