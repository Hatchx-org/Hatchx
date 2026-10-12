import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Club fair link" };

function Unavailable() {
  return <main className="mx-auto flex min-h-[65vh] max-w-xl items-center px-5 py-16 text-center">
    <div className="w-full rounded-[24px] border border-line bg-card p-8 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Club fair</p>
      <h1 className="mt-3 text-3xl font-bold text-ink">This QR code is no longer available</h1>
      <p className="mt-3 leading-7 text-muted">It may have expired or been revoked by the Club. You can still browse all currently published Clubs.</p>
      <Link href="/clubs" className="mt-6 inline-flex rounded-full bg-navy px-5 py-2.5 font-semibold text-cream">Browse Clubs</Link>
    </div>
  </main>;
}

export default async function ClubFairVisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isSupabaseConfigured() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return <Unavailable />;
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("resolve_club_share_link", { p_id: token });
  const clubId = data?.[0]?.club_id;
  if (!clubId) return <Unavailable />;
  const { data: club } = await supabase.from("clubs").select("slug").eq("id", clubId).eq("status", "published").maybeSingle();
  if (!club) return <Unavailable />;
  redirect(`/clubs/${club.slug}?source=club-fair`);
}
