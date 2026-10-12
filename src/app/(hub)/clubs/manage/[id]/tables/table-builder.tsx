"use client";

import { useActionState, useRef, useState } from "react";
import type { ClubCustomColumn } from "@/lib/supabase/types";
import { createCustomTable, updateCustomTable } from "./actions";

const input = "h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/10";
type EditableColumn = ClubCustomColumn & { id: string };

const fieldTypes: Array<{ value: ClubCustomColumn["type"]; label: string }> = [
  { value: "text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "url", label: "HTTPS link" },
  { value: "select", label: "Dropdown" },
];

export default function TableBuilder({ clubId, table }: {
  clubId: string;
  table?: { id: string; name: string; description: string | null; columns: ClubCustomColumn[] };
}) {
  const initial = table?.columns.map(column => ({ ...column, id: column.key })) ?? [
    { id: "column_1", key: "column_1", label: "", type: "text" as const, required: false },
  ];
  const [columns, setColumns] = useState<EditableColumn[]>(initial);
  const nextKey = useRef(Math.max(0, ...initial.map(column => Number(column.key.split("_")[1]) || 0)) + 1);
  const actionFn = table ? updateCustomTable : createCustomTable;
  const [result, action, pending] = useActionState(
    async (_state: { ok: boolean; message: string } | null, form: FormData) => actionFn(form),
    null,
  );

  function update(id: string, values: Partial<EditableColumn>) {
    setColumns(current => current.map(column => column.id === id ? { ...column, ...values } : column));
  }

  function addColumn(afterIndex = columns.length - 1, source?: EditableColumn) {
    if (columns.length >= 30) return;
    const key = `column_${nextKey.current++}`;
    const next: EditableColumn = source
      ? { ...source, id: key, key, label: `${source.label || "Untitled question"} copy`, options: source.options ? [...source.options] : undefined }
      : { id: key, key, label: "", type: "text", required: false };
    setColumns(current => [...current.slice(0, afterIndex + 1), next, ...current.slice(afterIndex + 1)]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    setColumns(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={action} className="mt-5 grid gap-5">
      <input type="hidden" name="club_id" value={clubId} />
      {table ? <input type="hidden" name="table_id" value={table.id} /> : null}

      <section className="overflow-hidden rounded-card border border-line bg-card shadow-sm">
        <div className="h-2 bg-powder" />
        <div className="grid gap-4 p-5 sm:p-7">
          <label className="text-sm font-semibold text-ink">
            Form title
            <input name="name" required minLength={2} maxLength={80} defaultValue={table?.name} placeholder="Volunteer hours" className={`${input} mt-1.5 text-base font-semibold`} />
          </label>
          <label className="text-sm font-semibold text-ink">
            Description <span className="font-normal text-muted">(optional)</span>
            <textarea name="description" maxLength={500} rows={2} defaultValue={table?.description ?? ""} placeholder="Tell people what this form is for." className={`${input} mt-1.5 h-auto py-3 font-normal`} />
          </label>
        </div>
      </section>

      <fieldset className="grid gap-4">
        <legend className="sr-only">Questions</legend>
        {columns.map((column, index) => (
          <section key={column.id} className="rounded-card border border-line bg-card p-5 shadow-sm transition focus-within:border-powder focus-within:shadow-md sm:p-6">
            <input type="hidden" name="column_key" value={column.key} />
            <div className="flex items-start gap-3">
              <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-cream">{index + 1}</span>
              <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-[1fr_190px]">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Question
                  <input name="column_label" required maxLength={80} value={column.label} onChange={event => update(column.id, { label: event.target.value })} placeholder="Untitled question" className={`${input} mt-1.5 text-base font-semibold normal-case tracking-normal`} />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Answer type
                  <select name="column_type" value={column.type} onChange={event => update(column.id, { type: event.target.value as ClubCustomColumn["type"] })} className={`${input} mt-1.5 normal-case tracking-normal`}>
                    {fieldTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {column.type === "select" ? (
              <label className="mt-4 block pl-10 text-xs font-semibold uppercase tracking-wide text-muted">
                Choices
                <textarea name="column_options" value={column.options?.join("\n") ?? ""} onChange={event => update(column.id, { options: event.target.value.split("\n") })} rows={4} required placeholder={"One choice per line\nExample: Grade 9\nGrade 10"} className={`${input} mt-1.5 h-auto py-3 font-normal normal-case tracking-normal`} />
              </label>
            ) : <input type="hidden" name="column_options" value="" />}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-1 border-t border-line pt-4">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move question up" title="Move up" className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:bg-content-bg disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === columns.length - 1} aria-label="Move question down" title="Move down" className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:bg-content-bg disabled:opacity-30">↓</button>
              <button type="button" onClick={() => addColumn(index, column)} disabled={columns.length >= 30} className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:bg-content-bg disabled:opacity-30">Duplicate</button>
              <button type="button" disabled={columns.length === 1} onClick={() => setColumns(current => current.filter(item => item.id !== column.id))} className="rounded-full px-3 py-2 text-sm font-semibold text-orange hover:bg-content-bg disabled:opacity-30">Delete</button>
              <span className="mx-2 h-6 w-px bg-line" />
              <label className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-ink">
                <input type="checkbox" name="column_required" value={column.key} checked={column.required} onChange={event => update(column.id, { required: event.target.checked })} /> Required
              </label>
            </div>
          </section>
        ))}
      </fieldset>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card/95 p-3 shadow-lg backdrop-blur">
        <button type="button" disabled={columns.length >= 30} onClick={() => addColumn()} className="h-11 rounded-full border border-line px-5 text-sm font-bold text-ink hover:bg-content-bg disabled:opacity-40">+ Add question</button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">{columns.length} of 30 questions</span>
          <button disabled={pending} className="h-11 rounded-full bg-navy px-6 text-sm font-bold text-cream disabled:opacity-50">{pending ? "Saving…" : table ? "Save changes" : "Create form"}</button>
        </div>
      </div>

      {table ? <p className="text-xs text-muted">Deleting a question hides it from existing responses and exports. Editing an old response permanently removes that hidden value.</p> : null}
      {result ? <p role={result.ok ? "status" : "alert"} className={`rounded-control border p-3 text-sm ${result.ok ? "border-powder/40 bg-powder/10" : "border-orange/40 bg-orange/5"}`}>{result.message}</p> : null}
    </form>
  );
}
