import ActionFeedbackForm from "@/components/action-feedback-form";
import { createServerClient } from "@/lib/supabase/server";
import type { ClubInvitationEmailOutboxRow, ClubMemberInvitationRow } from "@/lib/supabase/types";
import { inviteStudentToClub, revokeStudentClubInvitation } from "../actions";

const input = "h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";
async function requestTime() { return Date.now(); }

export default async function StudentInvitationPanel({ clubId }: { clubId: string }) {
  const db = await createServerClient();
  const invitationResult = await db.from("club_member_invitations").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(30);
  const invitations: ClubMemberInvitationRow[] = invitationResult.data ?? [];
  const ids = invitations.map((invitation) => invitation.id);
  const emails = ids.length ? await db.from("club_invitation_email_outbox").select("*").in("invitation_id", ids).order("created_at", { ascending: false }) : { data: [] };
  const latestEmail = new Map<string, ClubInvitationEmailOutboxRow>();
  for (const email of emails.data ?? []) if (!latestEmail.has(email.invitation_id)) latestEmail.set(email.invitation_id, email);
  const now = await requestTime();

  return <section id="student-invitations" className="scroll-mt-28 rounded-[20px] border border-line bg-card p-5 shadow-sm" aria-labelledby="student-invitations-title">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Recruiting</p>
    <h2 id="student-invitations-title" className="mt-1 text-xl font-bold text-ink">Invite a new student</h2>
    <p className="mt-2 text-sm leading-6 text-muted">Send the student an introduction with this Club’s meeting details and social links. If they have not registered, Hatchx will add them automatically when they create an account with the same school email.</p>
    {invitationResult.error ? <p role="alert" className="mt-4 rounded-control border border-orange/40 bg-content-bg p-3 text-sm text-muted">Apply <code>supabase/schema.sql</code> to enable email invitations.</p> : <>
      <ActionFeedbackForm action={inviteStudentToClub} className="mt-4 grid gap-3">
        <input type="hidden" name="club_id" value={clubId} />
        <label className="text-sm font-medium text-ink">Student school email<input type="email" name="email" required pattern="[^@\s]+@nycstudents\.net" placeholder="student@nycstudents.net" className={`${input} mt-1`} /></label>
        <label className="text-sm font-medium text-ink">Welcome message <span className="font-normal text-muted">(optional)</span><textarea name="personal_message" maxLength={500} rows={3} placeholder="Tell the student why they would enjoy this Club…" className="mt-1 w-full rounded-control border border-line bg-content-bg px-3 py-2 text-sm text-ink" /></label>
        <p className="text-xs leading-5 text-muted">The invitation expires after 30 days. Sending again refreshes the expiration and sends an updated introduction.</p>
        <button className="h-11 rounded-full bg-navy px-5 font-bold text-cream">Send invitation</button>
      </ActionFeedbackForm>
      <div className="mt-5 space-y-3">{invitations.length ? invitations.map((invitation) => {
        const email = latestEmail.get(invitation.id);
        const expired = invitation.status === "pending" && new Date(invitation.expires_at).getTime() <= now;
        const status = expired ? "expired" : invitation.status;
        return <article key={invitation.id} className="rounded-control border border-line bg-content-bg p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-all text-sm font-semibold text-ink">{invitation.email}</p><p className="mt-1 text-xs text-muted">Invitation {status} · email {email?.status ?? "not queued"}</p>{email?.last_error ? <p className="mt-1 text-xs text-orange">{email.last_error}</p> : null}</div><span className="rounded-full border border-line px-2 py-1 text-[10px] font-bold uppercase text-muted">{status}</span></div>{status === "pending" ? <ActionFeedbackForm action={revokeStudentClubInvitation} className="mt-3"><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="invitation_id" value={invitation.id} /><button className="text-xs font-semibold text-orange underline">Revoke invitation</button></ActionFeedbackForm> : null}</article>;
      }) : <p className="rounded-control bg-content-bg p-4 text-sm text-muted">No student invitations yet.</p>}</div>
    </>}
  </section>;
}
