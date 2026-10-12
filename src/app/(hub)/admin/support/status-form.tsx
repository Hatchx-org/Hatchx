"use client";

import { useActionState } from "react";
import { setSupportRequestStatus } from "../actions";

export default function SupportStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(setSupportRequestStatus, null);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="id" value={id} /><select name="status" defaultValue={status} className="h-9 rounded-full border border-black/10 bg-content-bg px-3 text-xs font-semibold text-ink"><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><button disabled={pending} className="h-9 rounded-full bg-navy px-4 text-xs font-semibold text-cream disabled:opacity-50">{pending ? "Saving…" : "Update"}</button>{state && <span role={state.ok ? "status" : "alert"} className={`basis-full text-right text-xs ${state.ok ? "text-navy" : "text-orange"}`}>{state.message}</span>}</form>;
}
