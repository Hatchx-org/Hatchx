"use client";

import Link from "next/link";
import { useActionState } from "react";
import { checkIn } from "./actions";
import type { ClubCheckInStatus } from "@/lib/supabase/types";

export default function CheckInForm({ initialCode, initialStatus }: { initialCode: string; initialStatus: ClubCheckInStatus | null }) {
  const [state, submit, pending] = useActionState(checkIn, null);
  const canSubmit = !initialCode || !initialStatus || initialStatus.status === "ready";
  const statusTone = initialStatus?.status === "already_checked_in" ? "border-powder/50 bg-powder/10" : "border-[#f78660]/50 bg-[#f78660]/10";
  return <form action={submit} className="mt-7">
    {initialCode && initialStatus ? <input type="hidden" name="code" value={initialCode} /> : <><label htmlFor="attendance-code" className="text-sm font-semibold text-cream">Attendance code</label><input id="attendance-code" name="code" defaultValue={initialCode} required minLength={8} maxLength={8} autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} placeholder="ABCD2345" className="mt-2 h-14 w-full rounded-control border border-line bg-content-bg px-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.2em] text-ink" /></>}
    {initialStatus && initialStatus.status !== "ready" ? <div role={initialStatus.status === "already_checked_in" ? "status" : "alert"} className={`rounded-control border p-4 text-sm text-cream ${statusTone}`}><p className="font-semibold">{initialStatus.message}</p></div> : null}
    {canSubmit ? <><label htmlFor="attendance-comments" className="mt-4 block text-sm font-semibold text-cream">Do you have any comments or concerns? <span className="font-normal text-cream/60">(optional)</span></label><textarea id="attendance-comments" name="comments" maxLength={1000} rows={4} placeholder="Share anything you would like the Club organizers to know." className="mt-2 w-full resize-y rounded-control border border-line bg-content-bg px-4 py-3 text-sm leading-6 text-ink outline-none focus:border-powder focus:ring-2 focus:ring-powder/20" /><button disabled={pending} className="mt-4 h-11 w-full rounded-full bg-cream px-6 font-bold text-black disabled:opacity-60">{pending ? "Confirming…" : initialCode ? "Confirm check-in" : "Check in"}</button></> : null}
    {state ? <div role={state.ok ? "status" : "alert"} className={`mt-5 rounded-control border p-4 text-sm ${state.ok ? "border-powder/50 bg-powder/10 text-cream" : "border-[#f78660]/60 bg-[#f78660]/10 text-cream"}`}>
      <p className="font-semibold">{state.message}</p>
      {state.activity ? <p className="mt-1 text-cream/65">{state.activity}</p> : null}
      {state.ok && state.clubSlug ? <Link href={`/clubs/${state.clubSlug}`} className="mt-3 inline-block font-semibold text-powder">Return to Club →</Link> : null}
    </div> : null}
  </form>;
}
