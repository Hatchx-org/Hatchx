"use client";

import { useActionState } from "react";
import { createOpportunity, deleteOpportunity, setOpportunityStatus, updateOpportunity } from "../actions";
import type { OpportunityRow } from "@/lib/supabase/types";

const field = "h-10 w-full rounded-control border border-black/10 bg-content-bg px-3 text-sm text-ink";

export function OpportunityForm() {
  const [state, action, pending] = useActionState(createOpportunity, null);
  return <form action={action} className="mt-4 grid gap-3"><input name="title" required minLength={3} maxLength={120} placeholder="Title" className={field} /><select name="category" className={field}><option value="community_service">Community service</option><option value="internship">Internship</option><option value="pre_college">Pre-college</option><option value="scholarship">Scholarship</option><option value="discount">Student discount</option></select><textarea name="description" required minLength={10} maxLength={4000} rows={4} placeholder="Description" className={`${field} h-auto py-2`} /><textarea name="eligibility" rows={2} placeholder="Eligibility" className={`${field} h-auto py-2`} /><input type="url" name="application_link" placeholder="https:// application link" className={field} /><label className="text-xs font-semibold text-muted">Deadline<input type="datetime-local" name="deadline" className={`${field} mt-1`} /></label>{state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-navy" : "text-orange"}`}>{state.message}</p>}<button disabled={pending} className="h-10 rounded-full bg-navy px-5 font-semibold text-cream disabled:opacity-50">{pending ? "Saving…" : "Save draft"}</button></form>;
}

export function OpportunityStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(setOpportunityStatus, null);
  return <form action={action} className="flex flex-wrap items-center justify-end gap-2"><input type="hidden" name="id" value={id} /><select name="status" defaultValue={status} className="h-9 rounded-full border border-black/10 bg-content-bg px-3 text-xs font-semibold text-ink"><option value="draft">Draft</option><option value="in_review">In review</option><option value="published">Published</option><option value="expired">Expired</option><option value="archived">Archived</option></select><button disabled={pending} className="h-9 rounded-full bg-navy px-4 text-xs font-semibold text-cream">{pending ? "Saving…" : "Update"}</button>{state && <span className="basis-full text-right text-xs text-muted">{state.message}</span>}</form>;
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function OpportunityEditForm({ opportunity }: { opportunity: OpportunityRow }) {
  const [state, action, pending] = useActionState(updateOpportunity, null);
  const [deleteState, deleteAction, deleting] = useActionState(deleteOpportunity, null);
  return <details className="mt-3 rounded-control border border-line p-3"><summary className="cursor-pointer text-xs font-bold text-navy">Edit content</summary><form action={action} className="mt-3 grid gap-3"><input type="hidden" name="id" value={opportunity.id}/><input name="title" required minLength={3} maxLength={120} defaultValue={opportunity.title} className={field}/><select name="category" defaultValue={opportunity.category} className={field}><option value="community_service">Community service</option><option value="internship">Internship</option><option value="pre_college">Pre-college</option><option value="scholarship">Scholarship</option><option value="discount">Student discount</option></select><textarea name="description" required minLength={10} maxLength={4000} rows={4} defaultValue={opportunity.description} className={`${field} h-auto py-2`}/><textarea name="eligibility" rows={2} defaultValue={opportunity.eligibility ?? ""} className={`${field} h-auto py-2`}/><input type="url" name="application_link" defaultValue={opportunity.application_link ?? ""} placeholder="https://" className={field}/><label className="text-xs font-semibold text-muted">Deadline<input type="datetime-local" name="deadline" defaultValue={localDateTime(opportunity.deadline)} className={`${field} mt-1`}/></label>{state&&<p role={state.ok?"status":"alert"} className="text-xs text-muted">{state.message}</p>}<button disabled={pending} className="h-10 rounded-full bg-navy px-4 text-sm font-bold text-cream">{pending?"Saving…":"Save content"}</button></form><form action={deleteAction} className="mt-3 flex items-center gap-2 border-t border-line pt-3"><label className="text-xs text-muted"><input type="checkbox" name="confirm" value="delete" required/> Confirm permanent deletion</label><input type="hidden" name="id" value={opportunity.id}/><button disabled={deleting} className="ml-auto text-xs font-bold text-orange">{deleting?"Deleting…":"Delete"}</button>{deleteState&&<span className="text-xs text-muted">{deleteState.message}</span>}</form></details>;
}
