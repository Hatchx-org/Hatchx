"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ClubCustomColumn } from "@/lib/supabase/types";
import { addCustomTableRow } from "../actions";

const input = "mt-2 h-12 w-full rounded-control border border-line bg-content-bg px-3 text-base text-ink outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10";

function Question({ column }: { column: ClubCustomColumn }) {
  const title = <>{column.label}{column.required ? <span className="ml-1 text-orange" aria-label="required">*</span> : null}</>;
  if (column.type === "checkbox") return <label className="flex cursor-pointer items-center gap-3 text-base font-semibold"><input type="checkbox" name={column.key} className="size-5" /> {title}</label>;
  if (column.type === "long_text") return <label className="block text-base font-semibold">{title}<textarea name={column.key} required={column.required} maxLength={2000} rows={5} placeholder="Your answer" className={`${input} h-auto py-3 font-normal`} /></label>;
  if (column.type === "select") return <label className="block text-base font-semibold">{title}<select name={column.key} required={column.required} defaultValue="" className={`${input} font-normal`}><option value="">Choose an answer</option>{column.options?.map(option => <option key={option}>{option}</option>)}</select></label>;
  const type = column.type === "number" ? "number" : column.type === "date" ? "date" : column.type === "email" ? "email" : column.type === "url" ? "url" : "text";
  const placeholder = column.type === "email" ? "name@example.com" : column.type === "url" ? "https://" : column.type === "number" ? "0" : "Your answer";
  return <label className="block text-base font-semibold">{title}<input name={column.key} type={type} required={column.required} maxLength={["text", "email", "url"].includes(column.type) ? 2000 : undefined} step={column.type === "number" ? "any" : undefined} pattern={column.type === "url" ? "https://.*" : undefined} placeholder={placeholder} className={`${input} font-normal`} /></label>;
}

export default function ResponseForm({ clubId, tableId, columns }: { clubId: string; tableId: string; columns: ClubCustomColumn[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, action, pending] = useActionState(async (_state: { ok: boolean; message: string } | null, form: FormData) => addCustomTableRow(form), null);
  useEffect(() => { if (result?.ok) formRef.current?.reset(); }, [result]);
  return <form ref={formRef} action={action} className="grid gap-4" aria-busy={pending}>
    <input type="hidden" name="club_id" value={clubId} />
    <input type="hidden" name="table_id" value={tableId} />
    {columns.map((column, index) => <section key={column.key} className="rounded-card border border-line bg-card p-5 shadow-sm sm:p-6"><p className="mb-3 text-xs font-bold uppercase tracking-widest text-powder">Question {index + 1}</p><Question column={column} /></section>)}
    <div className="flex items-center justify-between gap-4">
      <button disabled={pending} className="h-11 rounded-full bg-navy px-7 text-sm font-bold text-cream disabled:opacity-50">{pending ? "Submitting…" : "Submit response"}</button>
      <button type="reset" className="px-3 py-2 text-sm font-semibold text-muted hover:text-ink">Clear form</button>
    </div>
    {result ? <p role={result.ok ? "status" : "alert"} className={`rounded-control border p-4 text-sm font-semibold ${result.ok ? "border-powder/40 bg-powder/10" : "border-orange/40 bg-orange/5"}`}>{result.ok ? "Response recorded. The form is ready for another entry." : result.message}</p> : null}
  </form>;
}
