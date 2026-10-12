import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { headers } from "next/headers";
import ActionFeedbackForm from "@/components/action-feedback-form";
import type { ClubAttendanceRecordDetail, ClubAttendanceSessionRow } from "@/lib/supabase/types";
import { createServerClient } from "@/lib/supabase/server";
import { closeAttendanceSession, createAttendanceSession } from "../actions";
import { attendanceDurationLabel, temporaryAttendanceDurations } from "@/lib/attendance-session";
import AttendanceStartInput from "./attendance-start-input";

const input = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

async function origin() {
  const values = await headers();
  const host = values.get("x-forwarded-host") ?? values.get("host") ?? "localhost:3000";
  const protocol = values.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function requestTime() { return Date.now(); }

export default async function AttendancePanel({ clubId }: { clubId: string }) {
  const supabase = await createServerClient();
  const [{ data }, { data: records }] = await Promise.all([
    supabase.from("club_attendance_sessions").select("*").eq("club_id", clubId).order("created_at", { ascending: false }).limit(12),
    supabase.rpc("get_club_attendance_records", { p_club_id: clubId, p_limit: 1000 }),
  ]);
  const sessions: ClubAttendanceSessionRow[] = data ?? [];
  const attendanceRecords: ClubAttendanceRecordDetail[] = records ?? [];
  const attendanceCounts = new Map<string, number>();
  for (const record of attendanceRecords) attendanceCounts.set(record.session_id, (attendanceCounts.get(record.session_id) ?? 0) + 1);
  const siteOrigin = await origin();
  const now = await requestTime();
  const rows = await Promise.all(sessions.map(async (session) => ({
    ...session,
    qr: await QRCode.toDataURL(`${siteOrigin}/clubs/check-in?code=${encodeURIComponent(session.code)}`, {
      width: 280,
      margin: 1,
      color: { dark: "#080d20", light: "#f0ebe5" },
    }),
  })));

  return <section id="attendance" className="mt-8 scroll-mt-28" aria-labelledby="attendance-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="attendance-title" className="font-display text-2xl font-bold uppercase text-cream">Quick attendance</h2><Link href={`/clubs/manage/${clubId}/attendance/export`} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-powder transition-colors hover:bg-card">Export all records (.csv)</Link></div>
    <p className="mt-2 text-sm text-cream/60">Create a code for one activity, then display its QR code or share the 8-character code with active Club members.</p>
    <ActionFeedbackForm action={createAttendanceSession} className="card-gradient mt-4 grid gap-3 rounded-[10px] p-6 sm:grid-cols-2">
      <input type="hidden" name="club_id" value={clubId} />
      <label className="text-sm text-cream sm:col-span-2">Activity name<input name="label" required minLength={3} maxLength={120} placeholder="September 9 meeting" className={`${input} mt-1`} /></label>
      <AttendanceStartInput />
      <label className="text-sm text-cream">Code type<select name="code_type" className={`${input} mt-1`}><option value="temporary">Temporary</option><option value="permanent">Permanent until closed</option></select></label>
      <label className="text-sm text-cream">Temporary duration<select name="duration_minutes" defaultValue="15" className={`${input} mt-1`}>{temporaryAttendanceDurations.map((minutes) => <option key={minutes} value={minutes}>{attendanceDurationLabel(minutes)}</option>)}</select><span className="mt-1 block text-xs text-cream/55">Short windows are useful when the code is displayed only at the start of a meeting.</span></label>
      <button className="h-10 rounded-full bg-cream px-5 font-bold text-black sm:col-span-2">Generate check-in code</button>
    </ActionFeedbackForm>
    {rows.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{rows.map((session) => {
      const expired = session.expires_at ? new Date(session.expires_at).getTime() <= now : false;
      const startsAt = new Date(session.starts_at ?? session.created_at).getTime();
      const scheduled = startsAt > now;
      const usable = session.active && !scheduled && !expired;
      const canClose = session.active && !expired;
      return <article key={session.id} className="card-gradient rounded-[12px] p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <Image src={session.qr} alt={`QR code for ${session.label}`} width={160} height={160} unoptimized className={`size-40 rounded-md ${usable ? "" : "opacity-35"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-powder">{session.code_type} · {scheduled ? "Scheduled" : usable ? "Open" : expired ? "Expired" : "Closed"}</p>
            <h3 className="mt-1 text-lg font-semibold text-cream">{session.label}</h3>
            <p className="mt-3 font-mono text-3xl font-bold tracking-[0.16em] text-cream">{session.code}</p>
            <p className="mt-2 text-xs text-cream/55">{scheduled ? `Opens ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(startsAt))}` : "Open now"} · {session.expires_at ? `Expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.expires_at))}` : "No automatic expiration"}</p>
            <p className="mt-1 text-xs font-semibold text-powder">{attendanceCounts.get(session.id) ?? 0} checked in</p>
            {canClose ? <ActionFeedbackForm action={closeAttendanceSession} className="mt-4"><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="session_id" value={session.id} /><button className="rounded-full border border-[#f78660] px-4 py-2 text-xs font-semibold text-[#f78660]">Close check-in</button></ActionFeedbackForm> : null}
          </div>
        </div>
        <details className="mt-5 border-t border-white/10 pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-powder">View attendance records</summary>
          {attendanceCounts.get(session.id) ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-cream/50"><tr><th className="pb-2 pr-4">Member</th><th className="pb-2">Checked in</th></tr></thead>
            <tbody className="divide-y divide-white/10">{attendanceRecords.filter((record) => record.session_id === session.id).map((record) => <tr key={record.id}>
              <td className="py-2 pr-4 font-medium text-cream">{record.member_name}</td>
              <td className="py-2 text-cream/65"><time dateTime={record.checked_in_at}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.checked_in_at))}</time></td>
            </tr>)}</tbody>
          </table></div> : <p className="mt-3 text-sm text-cream/55">No members have checked in yet.</p>}
        </details>
      </article>;
    })}</div> : <p className="mt-4 rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">No check-in codes yet.</p>}
  </section>;
}
