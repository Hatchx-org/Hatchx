"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import AnnouncementBody from "@/components/announcement-body";
import type { AnnouncementDraftRow, AnnouncementVersionRow } from "@/lib/supabase/types";
import { restoreAnnouncementVersion, updateAnnouncement } from "../../actions";
import { localDateTime, useDraftAutosave } from "../use-draft-autosave";
import AudienceFields from "../audience-fields";

type AnnouncementEdit = { id: string; title: string; tag: string; body: string; publish_at?: string | null; priority?: "normal" | "important" | "urgent" | "emergency"; pinned_until?: string | null; expires_at?: string | null; audience_type?: "school" | "grades" | "clubs"; audience_grades?: number[]; audience_club_ids?: string[]; notify_in_app?: boolean; notify_email?: boolean };
const input = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

function VersionRestore({ announcementId, version }: { announcementId: string; version: AnnouncementVersionRow }) {
  const [state, action, pending] = useActionState(restoreAnnouncementVersion, null);
  useEffect(() => { if (state?.ok) window.location.reload(); }, [state]);
  return <form action={action} className="rounded-control border border-line bg-content-bg p-3 text-sm">
    <input type="hidden" name="id" value={announcementId} /><input type="hidden" name="version_id" value={version.id} />
    <p className="font-semibold text-ink">Version {version.version_number} · {version.snapshot_title}</p>
    <p className="mt-1 text-xs text-muted">{new Date(version.changed_at).toLocaleString()} · {version.version_note ?? "No note"}</p>
    <label className="mt-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="confirm" value="yes" required /> Restore this version’s title, body, and tag</label>
    <button disabled={pending} className="mt-2 rounded-full border border-navy/30 px-3 py-1 text-xs font-bold text-navy">{pending ? "Restoring…" : "Restore version"}</button>
    {state && <p role={state.ok ? "status" : "alert"} className="mt-2 text-xs text-muted">{state.message}</p>}
  </form>;
}

export default function EditAnnouncementForm({ announcement, draft, versions, clubs }: { announcement: AnnouncementEdit; draft?: AnnouncementDraftRow | null; versions: AnnouncementVersionRow[]; clubs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(updateAnnouncement, null);
  const [title, setTitle] = useState(draft?.title ?? announcement.title);
  const [tag, setTag] = useState(draft?.tag ?? announcement.tag);
  const [body, setBody] = useState(draft?.body ?? announcement.body);
  const [publishAt, setPublishAt] = useState(localDateTime(draft?.publish_at ?? announcement.publish_at));
  const [priority, setPriority] = useState<string>(draft?.priority ?? announcement.priority ?? "normal");
  const [pinnedUntil, setPinnedUntil] = useState(localDateTime(draft?.pinned_until ?? announcement.pinned_until));
  const [expiresAt, setExpiresAt] = useState(localDateTime(draft?.expires_at ?? announcement.expires_at));
  const [audienceType, setAudienceType] = useState(draft?.audience_type ?? announcement.audience_type ?? "school");
  const [audienceGrades, setAudienceGrades] = useState<number[]>(draft?.audience_grades ?? announcement.audience_grades ?? []);
  const [audienceClubIds, setAudienceClubIds] = useState<string[]>(draft?.audience_club_ids ?? announcement.audience_club_ids ?? []);
  const [notifyInApp, setNotifyInApp] = useState(draft?.notify_in_app ?? announcement.notify_in_app ?? true);
  const [notifyEmail, setNotifyEmail] = useState(draft?.notify_email ?? announcement.notify_email ?? false);
  const [preview, setPreview] = useState(false);
  const fields = useMemo(() => ({ title, tag, body, publishAt, priority, pinnedUntil, expiresAt, audienceType, audienceGrades, audienceClubIds, notifyInApp, notifyEmail }), [title, tag, body, publishAt, priority, pinnedUntil, expiresAt, audienceType, audienceGrades, audienceClubIds, notifyInApp, notifyEmail]);
  const autosave = useDraftAutosave(announcement.id, fields, state?.ok === true);

  return <div className="space-y-7"><form action={action} className="grid gap-4">
    <input type="hidden" name="id" value={announcement.id} />
    <label className="grid gap-1 text-sm font-semibold text-ink">Title<input name="title" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className={input} /></label>
    <label className="grid gap-1 text-sm font-semibold text-ink">Tag<select name="tag" value={tag} onChange={(event) => setTag(event.target.value)} className={input}>{["Announcements","Events","Clubs","Sports","Opportunities"].map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-1 text-sm font-semibold text-ink">Priority<select name="priority" value={priority} onChange={(event) => setPriority(event.target.value)} className={input}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select><span className="text-xs font-normal text-muted">Emergency uses the school-wide red alert style.</span></label>
    <label className="grid gap-1 text-sm font-semibold text-ink">Body<textarea name="body" required minLength={3} maxLength={10000} rows={10} value={body} onChange={(event) => setBody(event.target.value)} className={`${input} h-auto py-3`} /><span className="text-xs font-normal text-muted">Full https:// links become clickable after publication.</span></label>
    <label className="grid gap-1 text-sm font-semibold text-ink">Publication time (optional)<input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className={input} /><span className="text-xs font-normal text-muted">Future time hides this post until then; clear to publish immediately.</span></label>
    <input type="hidden" name="publish_at" value={publishAt ? new Date(publishAt).toISOString() : ""} />
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-semibold text-ink">Pin until<input type="datetime-local" value={pinnedUntil} onChange={(event) => setPinnedUntil(event.target.value)} className={input} /></label><label className="grid gap-1 text-sm font-semibold text-ink">Expire automatically<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={input} /></label></div>
    <input type="hidden" name="pinned_until" value={pinnedUntil ? new Date(pinnedUntil).toISOString() : ""} /><input type="hidden" name="expires_at" value={expiresAt ? new Date(expiresAt).toISOString() : ""} />
    <AudienceFields clubs={clubs} audienceType={audienceType} setAudienceType={setAudienceType} grades={audienceGrades} setGrades={setAudienceGrades} clubIds={audienceClubIds} setClubIds={setAudienceClubIds} notifyInApp={notifyInApp} setNotifyInApp={setNotifyInApp} notifyEmail={notifyEmail} setNotifyEmail={setNotifyEmail} />
    <p role="status" className="text-xs text-muted">{autosave || (draft ? "Recovered your saved edit draft." : "Changes save automatically as a draft.")}</p>
    <button type="button" onClick={() => setPreview((current) => !current)} className="justify-self-start text-sm font-semibold text-navy underline">{preview ? "Hide preview" : "Preview changes"}</button>
    {preview && <article className={`rounded-card border p-5 ${priority === "emergency" ? "border-red-500 bg-red-50 text-red-950" : "border-line bg-content-bg"}`}>{priority === "emergency" ? <p className="text-xs font-black uppercase tracking-[0.18em] text-red-700">Emergency alert</p> : <p className="text-xs font-bold uppercase text-muted">{tag}</p>}<h2 className="mt-2 text-xl font-bold">{title}</h2><p className={`mt-3 whitespace-pre-wrap text-sm leading-6 ${priority === "emergency" ? "text-red-900" : "text-muted"}`}><AnnouncementBody body={body} /></p></article>}
    <label className="grid gap-1 text-sm font-semibold text-ink">What changed?<input name="version_note" required maxLength={240} placeholder="Corrected the event time" className={input} /></label>
    {state && <p role={state.ok ? "status" : "alert"} className="text-sm text-muted">{state.message}</p>}
    <button disabled={pending} className="h-10 rounded-full bg-navy px-6 font-semibold text-cream disabled:opacity-50">{pending ? "Saving…" : "Save new version"}</button>
  </form>
  <section className="border-t border-line pt-5"><h2 className="text-lg font-bold text-ink">Version history</h2><p className="mt-1 text-xs text-muted">Restoring creates a new version. It does not change archive or scheduling status.</p><div className="mt-3 grid gap-2">{versions.length ? versions.map((version) => <VersionRestore key={version.id} announcementId={announcement.id} version={version} />) : <p className="text-sm text-muted">No earlier versions found.</p>}</div></section>
  </div>;
}
