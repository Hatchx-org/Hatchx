import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CheckInForm from "./check-in-form";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { profileCompletionPath, studentProfileNeedsCompletion } from "@/lib/profile-completion";
import { requestClubMembership } from "../actions";
import type { ClubCheckInStatus } from "@/lib/supabase/types";

export const metadata = { title: "Club check-in", description: "Quick attendance check-in for Hatchx Clubs." };
export const dynamic = "force-dynamic";

export default async function ClubCheckInPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  const normalized = code.trim().toUpperCase().slice(0, 8);
  const user = await getCurrentUser();
  const destination = `/clubs/check-in${normalized ? `?code=${normalized}` : ""}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(destination)}`);
  const db = await createServerClient();
  const { data: profile } = await db.from("profiles").select("role, osis_number, grade_level").eq("id", user.id).maybeSingle();
  if (studentProfileNeedsCompletion(profile)) redirect(profileCompletionPath(destination));
  let checkInStatus: ClubCheckInStatus | null = null;
  if (normalized.length === 8) {
    const result = await db.rpc("get_club_check_in_status", { p_code: normalized });
    checkInStatus = result.data?.[0] ?? null;
  }
  return <div className="mx-auto w-full max-w-lg px-6 py-12"><section className="card-gradient rounded-[18px] border border-white/10 p-7 sm:p-9">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Club attendance</p>
    <h1 className="mt-2 font-display text-4xl font-bold uppercase text-cream">Quick check-in</h1>
    <p className="mt-3 text-sm leading-6 text-cream/60">Scan the organizer&apos;s QR code or enter the code shown at the activity. You must be an active member of that Club.</p>
    {checkInStatus?.club_name ? <div className="mt-6 rounded-control border border-line bg-content-bg/10 p-4"><p className="text-xs font-bold uppercase tracking-wider text-powder">{checkInStatus.club_name}</p><p className="mt-1 font-semibold text-cream">{checkInStatus.session_label}</p></div> : null}
    <CheckInForm initialCode={normalized} initialStatus={checkInStatus} />
    {checkInStatus?.status === "not_member" && checkInStatus.club_id && checkInStatus.club_slug ? <form action={requestClubMembership} className="mt-4">
      <input type="hidden" name="club_id" value={checkInStatus.club_id} />
      <input type="hidden" name="slug" value={checkInStatus.club_slug} />
      <input type="hidden" name="return_to" value={destination} />
      <button className="h-11 w-full rounded-full border border-powder bg-powder/10 px-5 font-bold text-cream">Join Club</button>
    </form> : null}
    {checkInStatus?.club_slug && ["not_member", "pending_member", "closed", "expired", "scheduled"].includes(checkInStatus.status) ? <Link href={`/clubs/${checkInStatus.club_slug}`} className="mt-4 inline-block text-sm font-semibold text-powder">View Club details →</Link> : null}
  </section></div>;
}
