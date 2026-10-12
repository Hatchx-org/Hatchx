"use client";

import Link from "next/link";
import { useActionState } from "react";
import { checkIn } from "./actions";

export default function CheckInForm({ initialCode }: { initialCode: string }) {
  const [state, submit, pending] = useActionState(checkIn, null);
  return <form action={submit} className="mt-7">
    <label htmlFor="attendance-code" className="text-sm font-semibold text-cream">Attendance code</label>
    <input id="attendance-code" name="code" defaultValue={initialCode} required minLength={8} maxLength={8} autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} placeholder="ABCD2345" className="mt-2 h-14 w-full rounded-control border border-line bg-content-bg px-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.2em] text-ink" />
    <button disabled={pending} className="mt-4 h-11 w-full rounded-full bg-cream px-6 font-bold text-black disabled:opacity-60">{pending ? "Checking in…" : "Check in"}</button>
    {state ? <div role={state.ok ? "status" : "alert"} className={`mt-5 rounded-control border p-4 text-sm ${state.ok ? "border-powder/50 bg-powder/10 text-cream" : "border-[#f78660]/60 bg-[#f78660]/10 text-cream"}`}>
      <p className="font-semibold">{state.message}</p>
      {state.activity ? <p className="mt-1 text-cream/65">{state.activity}</p> : null}
      {state.ok && state.clubSlug ? <Link href={`/clubs/${state.clubSlug}`} className="mt-3 inline-block font-semibold text-powder">Return to Club →</Link> : null}
    </div> : null}
  </form>;
}
