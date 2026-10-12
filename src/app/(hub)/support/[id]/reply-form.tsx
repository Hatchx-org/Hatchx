"use client";

import { useActionState, useRef, useEffect } from "react";
import { addSupportReply } from "../actions";

export default function SupportReplyForm({ requestId }: { requestId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(addSupportReply, null);
  useEffect(() => { if (state?.ok) formRef.current?.reset(); }, [state]);
  return <form ref={formRef} action={action} className="mt-4 grid gap-3"><input type="hidden" name="request_id" value={requestId} /><label className="text-sm font-semibold text-ink">Add a reply<textarea name="body" required minLength={1} maxLength={4000} rows={4} placeholder="Share an update or answer…" className="mt-1 w-full rounded-control border border-line bg-content-bg px-3 py-2 text-sm text-ink" /></label><div className="flex items-center justify-between gap-3">{state ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-navy" : "text-orange"}`}>{state.message}</p> : <span />}<button disabled={pending} className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-cream disabled:opacity-50">{pending ? "Sending…" : "Send reply"}</button></div></form>;
}
