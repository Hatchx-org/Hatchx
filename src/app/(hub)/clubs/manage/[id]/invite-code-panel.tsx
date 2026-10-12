import ActionFeedbackForm from "@/components/action-feedback-form";
import { createServerClient } from "@/lib/supabase/server";
import type { ClubInviteCodeRow } from "@/lib/supabase/types";
import { createClubInviteCode, revokeClubInviteCode } from "../actions";

const input = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

async function requestTime() { return Date.now(); }

export default async function InviteCodePanel({ clubId }: { clubId: string }) {
  const supabase = await createServerClient();
  const result = await supabase.from("club_invite_codes").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(30);
  const invites: ClubInviteCodeRow[] = result.data ?? [];
  const now = await requestTime();

  return <section id="invite-codes" className="scroll-mt-28 rounded-[20px] border border-line bg-card p-5 shadow-sm" aria-labelledby="invite-code-title">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Registration</p>
    <h2 id="invite-code-title" className="mt-1 text-xl font-bold text-ink">Club invite codes</h2>
    <p className="mt-2 text-sm leading-6 text-muted">Create a short 6-character code for new students. They can enter several codes while creating an account and join each Club automatically.</p>
    {result.error ? <p role="alert" className="mt-4 rounded-control border border-orange/40 bg-content-bg p-3 text-sm text-muted">Apply <code>student_registration_invites.sql</code> to enable registration invites.</p> : <>
      <ActionFeedbackForm action={createClubInviteCode} className="mt-4 grid gap-3">
        <input type="hidden" name="club_id" value={clubId} />
        <label className="text-sm font-medium text-ink">Label<input name="label" required minLength={3} maxLength={100} defaultValue="New member invite" className={`${input} mt-1`} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-ink">Expires <span className="font-normal text-muted">(optional)</span><input type="datetime-local" name="expires_at" className={`${input} mt-1`} /></label><label className="text-sm font-medium text-ink">Maximum uses <span className="font-normal text-muted">(optional)</span><input type="number" name="max_uses" min={1} max={1000} placeholder="Unlimited" className={`${input} mt-1`} /></label></div>
        <button className="h-10 rounded-full bg-navy px-5 font-bold text-cream">Create invite code</button>
      </ActionFeedbackForm>
      <div className="mt-5 space-y-3">{invites.length ? invites.map((invite) => { const expired = Boolean(invite.expires_at && new Date(invite.expires_at).getTime() <= now); const exhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses; const usable = invite.active && !expired && !exhausted; return <article key={invite.id} className="rounded-control border border-line bg-content-bg p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-muted">{invite.label}</p><p className="mt-1 break-all font-mono text-lg font-black tracking-wider text-ink">{invite.code}</p><p className="mt-1 text-xs text-muted">Used {invite.use_count}{invite.max_uses === null ? " times" : ` of ${invite.max_uses}`} · {invite.expires_at ? `Expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invite.expires_at))}` : "No expiration"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${usable ? "bg-[#d8f3df] text-[#176b35]" : "bg-line text-muted"}`}>{usable ? "Active" : expired ? "Expired" : exhausted ? "Used up" : "Revoked"}</span></div>{usable && <ActionFeedbackForm action={revokeClubInviteCode} className="mt-3"><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="invite_id" value={invite.id} /><button className="text-xs font-semibold text-[#a5382a] underline">Revoke code</button></ActionFeedbackForm>}</article>; }) : <p className="rounded-control bg-content-bg p-4 text-sm text-muted">No registration invite codes yet.</p>}</div>
    </>}
  </section>;
}
