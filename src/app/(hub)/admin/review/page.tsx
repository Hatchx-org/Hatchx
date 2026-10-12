import Image from "next/image";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ReviewForm } from "../../announcements/submit/forms";

export default async function ReviewPage() {
  await requireAdmin();
  const db = await createServerClient();
  const { data, error } = await db.from("school_announcement_submissions").select("*").eq("status", "pending").order("created_at").limit(100);
  const mediaIds = [...new Set((data ?? []).map((row) => row.media_id).filter((id): id is string => Boolean(id)))];
  const { data: mediaRows } = mediaIds.length ? await db.from("club_media").select("id,storage_path,alt_text,title").in("id", mediaIds) : { data: [] };
  const mediaById = new Map((mediaRows ?? []).map((item) => [item.id, { ...item, url: db.storage.from("club-media").getPublicUrl(item.storage_path).data.publicUrl }]));

  return <div className="mx-auto max-w-4xl space-y-6 px-5 py-8"><h1 className="text-3xl font-bold">School announcement review</h1>{error ? <p role="alert">Unable to load the review queue. No announcements have been changed.</p> : !data?.length ? <p>No submissions awaiting review.</p> : data.map((row) => {
    const media = row.media_id ? mediaById.get(row.media_id) : null;
    return <article key={row.id} className="rounded-2xl border border-line bg-card p-6"><h2 className="text-xl font-bold">{row.title}</h2><p className="mt-3 whitespace-pre-wrap break-words">{row.body}</p>{media ? <figure className="mt-4 overflow-hidden rounded-card border border-line"><Image src={media.url} alt={media.alt_text ?? ""} width={960} height={540} className="aspect-video w-full object-cover" /><figcaption className="px-4 py-2 text-xs text-muted">{media.title ?? "Submitted Club photo"}</figcaption></figure> : null}<ReviewForm id={row.id} /></article>;
  })}</div>;
}
