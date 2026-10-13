"use client";

import { useActionState } from "react";
import { saveSoNumber } from "@/app/(hub)/profile/actions";

export default function SoNumberForm({ initialValue }: { initialValue: string }) {
  const [state, action, pending] = useActionState(saveSoNumber, null);
  return <form action={action} className="mt-4 border-t border-line pt-4">
    <label htmlFor="so-number" className="text-xs text-muted">SO number <span>(optional)</span></label>
    <div className="mt-2 flex gap-2">
      <input id="so-number" name="so_number" type="text" defaultValue={initialValue} maxLength={50} autoComplete="off" placeholder="Add your SO number" className="h-10 min-w-0 flex-1 rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-powder focus:ring-2 focus:ring-powder/20" />
      <button disabled={pending} className="rounded-full bg-navy px-4 text-xs font-bold text-cream disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
    </div>
    <p className="mt-2 text-xs text-muted">Used only in Club attendance exports.</p>
    {state ? <p role={state.ok ? "status" : "alert"} className={`mt-2 text-xs font-semibold ${state.ok ? "text-powder" : "text-orange"}`}>{state.message}</p> : null}
  </form>;
}
