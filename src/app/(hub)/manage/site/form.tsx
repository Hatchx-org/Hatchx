"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { restoreSiteTextVersion, saveSiteDraft, saveSiteText } from "./actions";

type Draft = { body: string };
type Schedule = { body: string; publish_at: string };
type Version = { id: string; version_number: number; snapshot_body: string; changed_at: string };

function localDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function RestoreVersion({ field, version }: { field: string; version: Version }) {
  const [message, action, pending] = useActionState(restoreSiteTextVersion, "");
  useEffect(() => { if (message.startsWith("Restored.")) window.location.reload(); }, [message]);
  return <form action={action} className="border-t border-line py-2 text-xs"><input type="hidden" name="key" value={field} /><input type="hidden" name="version_id" value={version.id} /><p className="font-semibold text-ink">Version {version.version_number} · {new Date(version.changed_at).toLocaleString()}</p><p className="mt-1 line-clamp-2 text-muted">{version.snapshot_body || "(empty)"}</p><label className="mt-2 flex items-center gap-2"><input name="confirm" type="checkbox" value="yes" required /> Confirm restore</label><button disabled={pending} className="mt-2 font-semibold text-navy underline">{pending ? "Restoring…" : "Restore this version"}</button>{message && <p role="status">{message}</p>}</form>;
}

export default function SiteTextForm({ field, value, label, help, rows = 3, optional = false, control = "text", draft, schedule, versions }: { field: string; value: string; label: string; help: string; rows?: number; optional?: boolean; control?: "text" | "color" | "toggle"; draft?: Draft; schedule?: Schedule; versions?: Version[] }) {
  const [message, action, pending] = useActionState(saveSiteText, "");
  const [body, setBody] = useState(draft?.body ?? schedule?.body ?? value);
  const [publishAt, setPublishAt] = useState(localDateTime(schedule?.publish_at));
  const [preview, setPreview] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const first = useRef(true);
  const descriptionId = useId();

  useEffect(() => {
    if (message.startsWith("Saved.") || message.startsWith("Scheduled.")) return;
    if (first.current) { first.current = false; return; }
    setDraftStatus("Saving draft…");
    const timer = window.setTimeout(async () => setDraftStatus(await saveSiteDraft(field, body)), 1200);
    return () => window.clearTimeout(timer);
  }, [field, body, message]);

  return <div className="rounded-xl border border-line bg-card p-5 text-ink"><form action={action} className="grid gap-3" aria-busy={pending}>
    <input type="hidden" name="key" value={field} />
    <label htmlFor={`${descriptionId}-body`} className="grid gap-2 font-semibold">{label}{optional ? <span className="text-xs font-normal text-muted">Optional</span> : null}</label>
    {control === "toggle" ? <label className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-content-bg p-3"><input type="checkbox" checked={body === "true"} onChange={(event) => setBody(event.currentTarget.checked ? "true" : "false")} className="peer sr-only" /><span aria-hidden className="relative h-7 w-12 rounded-full bg-steel/45 transition peer-checked:bg-navy after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" /><span className="text-sm font-semibold text-ink">{body === "true" ? "Notice is on" : "Notice is off"}</span><input type="hidden" name="body" value={body} /></label> : control === "color" ? <div className="flex items-center gap-3"><input type="color" value={body} onChange={(event) => setBody(event.currentTarget.value)} aria-label={`${label} picker`} className="h-12 w-16 cursor-pointer rounded-control border border-line bg-content-bg p-1" /><input id={`${descriptionId}-body`} name="body" required value={body} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={(event) => setBody(event.currentTarget.value)} className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-content-bg px-3 font-mono text-ink" /></div> : <textarea id={`${descriptionId}-body`} name="body" required={!optional} maxLength={4000} value={body} rows={rows} aria-describedby={`${descriptionId}-help`} onChange={(event) => setBody(event.currentTarget.value)} className="w-full rounded-lg border border-line bg-content-bg p-3 font-normal text-ink" />}
    <p id={`${descriptionId}-help`} className="flex justify-between gap-3 text-xs text-muted"><span>{help}</span><span>{body.length}/4000</span></p>
    <label className="grid gap-1 text-xs font-semibold text-muted">Schedule change (optional)<input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="h-10 rounded-control border border-line bg-content-bg px-3 text-sm text-ink" /></label>
    <input type="hidden" name="publish_at" value={publishAt ? new Date(publishAt).toISOString() : ""} />
    {schedule && <p className="text-xs text-muted">Current scheduled text: {schedule.body.slice(0, 100)} · {new Date(schedule.publish_at).toLocaleString()}</p>}
    <p role="status" className="min-h-4 text-xs text-muted">{draftStatus || (draft ? "Recovered your saved draft." : "Draft saves automatically.")}</p>
    <button type="button" onClick={() => setPreview(!preview)} className="justify-self-start text-xs font-semibold text-navy underline">{preview ? "Hide preview" : "Preview before publishing"}</button>
    {preview && <div className="rounded-control border border-line bg-content-bg p-3"><p className="text-xs font-bold text-muted">{label} preview</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{body || "(empty)"}</p></div>}
    <button type="submit" disabled={pending} className="justify-self-start rounded-full bg-cream px-5 py-2 text-navy disabled:opacity-50">{pending ? "Saving…" : "Publish or schedule"}</button>
    {message && <p role="status" aria-live="polite" className="text-xs">{message}</p>}
  </form>
  <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-xs font-semibold text-navy">Version history &amp; restore</summary><div className="mt-2">{versions?.length ? versions.map((version) => <RestoreVersion key={version.id} field={field} version={version} />) : <p className="text-xs text-muted">No versions yet. Apply site_cms_workflow.sql.</p>}</div></details>
  </div>;
}
