"use client";
import { useActionState, useState } from "react";
import Image from "next/image";
import { submitSchoolAnnouncement, reviewSchoolAnnouncement } from "./actions";
const field = "min-h-11 w-full rounded-lg border border-line bg-content-bg px-3 py-2 text-ink";
type SubmissionMedia = { id: string; club_id: string; title: string | null; url: string; alt_text: string | null };
export function SubmissionForm({ clubs, media }: { clubs: { id: string; name: string }[]; media: SubmissionMedia[] }) {
  const [message, action, pending] = useActionState(submitSchoolAnnouncement, "");
  const [clubId, setClubId] = useState("");
  const [mediaId, setMediaId] = useState("");
  const availableMedia = media.filter((item) => item.club_id === clubId);
  const selectedMedia = availableMedia.find((item) => item.id === mediaId);
  return <form action={action} className="grid gap-4 rounded-2xl border border-line bg-card p-6">
    <label>Club<select className={field} name="club_id" required value={clubId} onChange={(event) => { setClubId(event.target.value); setMediaId(""); }}><option disabled value="">Choose your club</option>{clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
    <label>Title<input className={field} name="title" required minLength={3} maxLength={120} /></label>
    <label>School announcement<textarea className={field} rows={7} name="body" required minLength={3} maxLength={10000} /></label>
    <label>Optional approved photo<select className={field} name="media_id" value={mediaId} onChange={(event) => setMediaId(event.target.value)}><option value="">No photo</option>{availableMedia.map(item => <option key={item.id} value={item.id}>{item.title ?? "Club photo"}</option>)}</select><span className="mt-1 block text-xs text-muted">The photo will be reviewed with the announcement before becoming school-wide.</span></label>
    {selectedMedia ? <Image src={selectedMedia.url} alt={selectedMedia.alt_text ?? ""} width={720} height={405} className="aspect-video w-full rounded-xl object-cover" /> : null}
    <button disabled={pending} className="min-h-11 rounded-full bg-navy px-5 font-semibold text-cream disabled:opacity-50">{pending ? "Submitting…" : "Submit for review"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
export function ReviewForm({ id }: { id: string }) {
  const [message, action, pending] = useActionState(reviewSchoolAnnouncement, "");
  return <form action={action} className="mt-4 grid gap-3"><input type="hidden" name="id" value={id} /><label>Review feedback<textarea name="note" maxLength={2000} className={field} /></label><div className="flex gap-3"><button name="decision" value="approve" disabled={pending} className="min-h-11 rounded-full bg-navy px-5 text-cream">Approve and publish</button><button name="decision" value="reject" disabled={pending} className="min-h-11 rounded-full border border-line px-5">Reject</button></div>{message && <p role="status">{message}</p>}</form>;
}
