"use client";

import { useActionState } from "react";
import { submitSupportRequest } from "./actions";

const options = [
  ["technical", "Technical support"],
  ["club_support", "Club support"],
  ["charter", "Club charter or edit"],
  ["room_reservation", "Room reservation"],
  ["funding", "Funding request"],
  ["fundraising_finance", "Fundraising and finance"],
  ["report_outdated", "Report outdated information"],
  ["report_broken_link", "Report a broken link"],
  ["report_incorrect", "Report incorrect information"],
  ["report_other", "Other content report"],
] as const;

export default function SupportRequestForm() {
  const [state, action, pending] = useActionState(submitSupportRequest, null);
  return (
    <form action={action} className="mt-5 grid gap-4">
      <label className="grid gap-1.5 text-sm font-semibold text-[#2a2829]">
        Request type
        <select name="request_type" className="h-11 rounded-control border border-[#2a2829]/15 bg-[#f0ebe5] px-3 text-[#2a2829]" defaultValue="technical">
          {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-[#2a2829]">
        Subject
        <input name="subject" required minLength={3} maxLength={120} className="h-11 rounded-control border border-[#2a2829]/15 bg-[#f0ebe5] px-3 text-[#2a2829]" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-[#2a2829]">
        Details
        <textarea name="details" required minLength={10} maxLength={4000} rows={5} className="rounded-control border border-[#2a2829]/15 bg-[#f0ebe5] px-3 py-2 text-[#2a2829]" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-[#2a2829]">
        Requested date/time <span className="font-normal text-[#6f6a6b]">(optional, for room requests)</span>
        <input type="datetime-local" name="requested_for" className="h-11 rounded-control border border-[#2a2829]/15 bg-[#f0ebe5] px-3 text-[#2a2829]" />
      </label>
      {state && <p role={state.ok ? "status" : "alert"} className={`rounded-control px-3 py-2 text-sm ${state.ok ? "bg-powder/20 text-navy" : "bg-orange/15 text-orange"}`}>{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#263a99] px-6 text-sm font-bold text-[#f0ebe5] hover:bg-[#1e3279] disabled:opacity-50">
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
