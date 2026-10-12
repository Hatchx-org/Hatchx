import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CheckInForm from "./check-in-form";

export const metadata = { title: "Club check-in", description: "Quick attendance check-in for Hatchx Clubs." };
export const dynamic = "force-dynamic";

export default async function ClubCheckInPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  const normalized = code.trim().toUpperCase().slice(0, 8);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/clubs/check-in${normalized ? `?code=${normalized}` : ""}`)}`);
  return <div className="mx-auto w-full max-w-lg px-6 py-12"><section className="card-gradient rounded-[18px] border border-white/10 p-7 sm:p-9">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Club attendance</p>
    <h1 className="mt-2 font-display text-4xl font-bold uppercase text-cream">Quick check-in</h1>
    <p className="mt-3 text-sm leading-6 text-cream/60">Scan the organizer&apos;s QR code or enter the code shown at the activity. You must be an active member of that Club.</p>
    <CheckInForm initialCode={normalized} />
  </section></div>;
}
