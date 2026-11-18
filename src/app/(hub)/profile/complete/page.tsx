import { redirect } from "next/navigation";
import ProfileForm from "../profile-form";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/navigation";
import { studentProfileNeedsCompletion } from "@/lib/profile-completion";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Complete your profile" };
export const dynamic = "force-dynamic";

export default async function CompleteProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const db = await createServerClient();
  const { data: profile } = await db.from("profiles").select("full_name, role, osis_number, grade_level, so_number").eq("id", user.id).maybeSingle();
  if (!profile || !studentProfileNeedsCompletion(profile)) redirect(next);

  return <div className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16"><section className="rounded-panel border border-line bg-card p-6 shadow-lg sm:p-9">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-powder">One last step</p>
    <h1 className="mt-2 font-display text-3xl font-bold uppercase text-ink sm:text-4xl">Complete your profile</h1>
    <p className="mt-3 text-sm leading-6 text-muted">Students must provide a valid 9-digit OSIS number and grade before continuing. After saving, you will return to the page you originally opened.</p>
    <ProfileForm onboarding next={next} profile={{ fullName: profile.full_name ?? user.name, osisNumber: profile.osis_number ?? "", gradeLevel: profile.grade_level, soNumber: profile.so_number ?? "", student: true }} />
  </section></div>;
}
