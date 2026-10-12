"use client";

import { useActionState } from "react";
import { createCustomFormLink } from "../actions";

type Result = { ok: boolean; message: string; url?: string } | null;

export default function ShareLinkForm({ clubId, tableId }: { clubId: string; tableId: string }) {
  const [result, action, pending] = useActionState(async (_state: Result, form: FormData) => createCustomFormLink(form), null);
  const url = result && "url" in result ? result.url : undefined;
  return <form action={action} className="mt-4 grid gap-3" aria-busy={pending}>
    <input type="hidden" name="club_id" value={clubId}/><input type="hidden" name="table_id" value={tableId}/>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-semibold text-muted">Optional expiration<input type="datetime-local" name="expires_at" className="h-11 rounded-control border border-line bg-content-bg px-3 text-sm text-ink"/></label><button disabled={pending} className="h-11 rounded-full bg-navy px-5 text-sm font-bold text-cream disabled:opacity-50">{pending?"Creating…":"Create share link"}</button></div>
    {result && <p role={result.ok?"status":"alert"} className="text-sm">{result.message}</p>}
    {url && <div className="flex gap-2"><input readOnly value={url} aria-label="Public form URL" className="h-11 min-w-0 flex-1 rounded-control border border-line bg-content-bg px-3 text-sm"/><button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${url}`)} className="rounded-full border border-line px-4 text-sm font-bold">Copy</button></div>}
  </form>;
}
