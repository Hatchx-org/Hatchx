"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { archiveAdminClub, createAdminClub, deleteAdminClub, updateAdminClub, type ClubActionState } from "./actions";

export type AdminClubRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  category: string;
  member_count: number;
  status: "draft" | "published" | "archived";
  recruiting_status: "recruiting" | "paused" | "closed";
  join_policy: "instant" | "approval_required";
  contact_email: string | null;
  active_start_date: string | null;
  active_end_date: string | null;
  meeting: { day_of_week: number; start_time: string | null; end_time: string | null; location: string | null } | null;
};

type DialogState = { kind: "create" } | { kind: "edit" | "delete"; club: AdminClubRow } | null;
const initial: ClubActionState | null = null;
const input = "mt-1 h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-powder focus:ring-2 focus:ring-powder/20";
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function StatusBadge({ status }: { status: AdminClubRow["status"] }) {
  const tone = status === "published" ? "bg-[#e5f6ea] text-[#176b35]" : status === "draft" ? "bg-[#fff1c7] text-[#775600]" : "bg-content-bg text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${tone}`}>{status}</span>;
}

function ClubFields({ club }: { club?: AdminClubRow }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-semibold text-ink sm:col-span-2">Club name<input name="name" required minLength={2} maxLength={120} defaultValue={club?.name ?? ""} className={input} /></label>
    <label className="text-sm font-semibold text-ink sm:col-span-2">Description<textarea name="short_description" required minLength={10} maxLength={1000} rows={3} defaultValue={club?.short_description ?? ""} className={`${input} h-auto py-3`} /></label>
    <label className="text-sm font-semibold text-ink">Category<input name="category" required minLength={2} maxLength={30} defaultValue={club?.category ?? ""} placeholder="STEM, Service, Arts…" className={input} /></label>
    <label className="text-sm font-semibold text-ink">Contact email<input type="email" name="contact_email" defaultValue={club?.contact_email ?? ""} className={input} /></label>
    <label className="text-sm font-semibold text-ink">Status<select name="status" defaultValue={club?.status ?? "draft"} className={input}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    <label className="text-sm font-semibold text-ink">Recruiting<select name="recruiting_status" defaultValue={club?.recruiting_status ?? "recruiting"} className={input}><option value="recruiting">Recruiting</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label>
    <label className="text-sm font-semibold text-ink">Join policy<select name="join_policy" defaultValue={club?.join_policy ?? "approval_required"} className={input}><option value="approval_required">Approval required</option><option value="instant">Instant join</option></select></label>
    <span aria-hidden />
    <label className="text-sm font-semibold text-ink">Active from<input type="date" name="active_start_date" defaultValue={club?.active_start_date ?? ""} className={input} /></label>
    <label className="text-sm font-semibold text-ink">Active until<input type="date" name="active_end_date" defaultValue={club?.active_end_date ?? ""} className={input} /></label>
    <fieldset className="grid gap-3 rounded-control border border-line p-4 sm:col-span-2 sm:grid-cols-2"><legend className="px-2 text-sm font-bold text-ink">Primary meeting <span className="font-normal text-muted">(optional)</span></legend>
      <label className="text-sm font-semibold text-ink">Day<select name="meeting_day" defaultValue={club?.meeting?.day_of_week ?? ""} className={input}><option value="">No schedule</option>{days.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
      <label className="text-sm font-semibold text-ink">Location<input name="location" maxLength={160} defaultValue={club?.meeting?.location ?? ""} className={input} /></label>
      <label className="text-sm font-semibold text-ink">Starts<input type="time" name="start_time" defaultValue={club?.meeting?.start_time?.slice(0, 5) ?? ""} className={input} /></label>
      <label className="text-sm font-semibold text-ink">Ends<input type="time" name="end_time" defaultValue={club?.meeting?.end_time?.slice(0, 5) ?? ""} className={input} /></label>
      {club && <p className="text-xs leading-5 text-muted sm:col-span-2">This edits the primary schedule only. Use the detailed workspace to manage additional recurring meetings.</p>}
    </fieldset>
  </div>;
}

export default function ClubManagementClient({ clubs }: { clubs: AdminClubRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<ClubActionState | null>(null);
  const [state, submit, pending] = useActionState(async (_previous: ClubActionState | null, form: FormData) => {
    const intent = String(form.get("intent"));
    const result = intent === "create" ? await createAdminClub(form) : intent === "edit" ? await updateAdminClub(form) : intent === "archive" ? await archiveAdminClub(form) : await deleteAdminClub(form);
    setNotice(result);
    if (result.ok) {
      dialogRef.current?.close();
      setDialog(null);
      router.refresh();
    }
    return result;
  }, initial);

  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
  }, [dialog]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const open = (next: Exclude<DialogState, null>) => setDialog(next);

  return <>
    {notice && <div role={notice.ok ? "status" : "alert"} className={`fixed right-4 top-4 z-[80] max-w-sm rounded-control border px-4 py-3 text-sm font-semibold shadow-xl ${notice.ok ? "border-[#9dd8ae] bg-[#effaf2] text-[#176b35]" : "border-orange/30 bg-[#fff4ef] text-orange"}`}>{notice.message}</div>}
    <button onClick={() => open({ kind: "create" })} className="inline-flex h-11 items-center rounded-full bg-navy px-5 text-sm font-bold text-cream shadow-sm hover:bg-navy-dark">+ Create Club</button>

    <div className="mt-5 hidden overflow-visible rounded-card border border-line bg-card shadow-sm md:block">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="border-b border-line bg-content-bg text-xs uppercase tracking-[0.08em] text-muted"><tr><th className="w-[34%] px-4 py-3 font-bold">Club</th><th className="w-[18%] px-4 py-3 font-bold">Category</th><th className="w-[13%] px-4 py-3 text-center font-bold">Members</th><th className="w-[17%] px-4 py-3 font-bold">Status</th><th className="w-[18%] px-4 py-3 text-right font-bold">Actions</th></tr></thead>
        <tbody className="divide-y divide-line">
          {clubs.map((club) => <tr key={club.id} className="transition-colors hover:bg-content-bg/70">
            <td className="px-4 py-3"><Link href={`/clubs/manage/${club.id}`} className="block truncate font-bold text-ink hover:text-navy">{club.name}</Link><span className="mt-0.5 block truncate text-xs text-muted">{club.meeting ? `${days[club.meeting.day_of_week - 1]}${club.meeting.location ? ` · ${club.meeting.location}` : ""}` : "No meeting scheduled"}</span></td>
            <td className="truncate px-4 py-3 text-muted">{club.category}</td><td className="px-4 py-3 text-center font-semibold text-ink">{club.member_count}</td><td className="px-4 py-3"><StatusBadge status={club.status} /></td>
            <td className="px-4 py-3 text-right"><ActionMenu club={club} open={open} submit={submit} pending={pending} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="mt-4 grid gap-3 md:hidden">{clubs.map((club) => <article key={club.id} className="rounded-card border border-line bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/clubs/manage/${club.id}`} className="block truncate font-bold text-ink">{club.name}</Link><p className="mt-1 text-xs text-muted">{club.category} · {club.member_count} members</p></div><StatusBadge status={club.status} /></div><p className="mt-3 text-xs text-muted">{club.meeting ? `${days[club.meeting.day_of_week - 1]}${club.meeting.location ? ` · ${club.meeting.location}` : ""}` : "No meeting scheduled"}</p><div className="mt-3 border-t border-line pt-3 text-right"><ActionMenu club={club} open={open} submit={submit} pending={pending} /></div></article>)}</div>

    {dialog && <dialog ref={dialogRef} onClose={() => setDialog(null)} className="m-auto max-h-[90dvh] w-[min(720px,calc(100%-2rem))] overflow-y-auto rounded-[22px] border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-navy/55">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-card px-5 py-4"><div><h2 className="text-xl font-bold">{dialog.kind === "create" ? "Create Club" : dialog.kind === "edit" ? `Edit ${dialog.club.name}` : `Delete ${dialog.club.name}`}</h2><p className="mt-1 text-xs text-muted">{dialog.kind === "delete" ? "Permanent deletion cannot be undone." : "Changes save securely to Supabase."}</p></div><button type="button" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-full border border-line text-xl text-muted" aria-label="Close">×</button></div>
      {dialog.kind === "delete" ? <form action={submit} className="p-5" aria-busy={pending}><input type="hidden" name="intent" value="delete" /><input type="hidden" name="club_id" value={dialog.club.id} /><input type="hidden" name="club_name" value={dialog.club.name} /><div className="rounded-control border border-orange/25 bg-orange/10 p-4 text-sm leading-6"><strong>This deletes the Club and all connected data</strong>, including memberships, attendance sessions and records, meetings, posts, media metadata, invitations, finance records, and governance history. Archive it instead if records should be retained.</div><label className="mt-5 block text-sm font-semibold">Type <strong>{dialog.club.name}</strong> to confirm<input name="confirmation" required autoComplete="off" className={input} /></label>{state && !state.ok && <p role="alert" className="mt-3 text-sm text-orange">{state.message}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => dialogRef.current?.close()} className="h-11 rounded-full border border-line px-5 font-semibold">Cancel</button><button disabled={pending} className="h-11 rounded-full bg-orange px-5 font-bold text-white disabled:opacity-50">{pending ? "Deleting…" : "Delete permanently"}</button></div></form> : <form action={submit} className="p-5" aria-busy={pending}><input type="hidden" name="intent" value={dialog.kind} />{dialog.kind === "edit" && <input type="hidden" name="club_id" value={dialog.club.id} />}<ClubFields club={dialog.kind === "edit" ? dialog.club : undefined} />{state && !state.ok && <p role="alert" className="mt-3 text-sm text-orange">{state.message}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => dialogRef.current?.close()} className="h-11 rounded-full border border-line px-5 font-semibold">Cancel</button><button disabled={pending} className="h-11 rounded-full bg-navy px-6 font-bold text-cream disabled:opacity-50">{pending ? "Saving…" : dialog.kind === "create" ? "Create Club" : "Save changes"}</button></div></form>}
    </dialog>}
  </>;
}

function ActionMenu({ club, open, submit, pending }: { club: AdminClubRow; open: (state: Exclude<DialogState, null>) => void; submit: (payload: FormData) => void; pending: boolean }) {
  return <details className="relative inline-block text-left"><summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-full border border-line px-3 text-xs font-bold text-ink hover:bg-content-bg">Actions <span className="ml-1">⌄</span></summary><div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-control border border-line bg-card p-1 text-left shadow-xl">
    <Link href={`/clubs/${club.slug}`} className="block rounded-md px-3 py-2 text-sm hover:bg-content-bg">View public page</Link><button type="button" onClick={() => open({ kind: "edit", club })} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-content-bg">Edit information</button><Link href={`/clubs/manage/${club.id}#members`} className="block rounded-md px-3 py-2 text-sm hover:bg-content-bg">Manage members</Link><Link href={`/clubs/manage/${club.id}`} className="block rounded-md px-3 py-2 text-sm hover:bg-content-bg">Open workspace</Link>
    {club.status !== "archived" && <form action={submit}><input type="hidden" name="intent" value="archive" /><input type="hidden" name="club_id" value={club.id} /><button disabled={pending} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-content-bg disabled:opacity-50">Archive Club</button></form>}
    <button type="button" onClick={() => open({ kind: "delete", club })} className="block w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-orange hover:bg-orange/10">Delete…</button>
  </div></details>;
}
