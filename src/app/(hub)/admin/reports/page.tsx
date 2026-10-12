import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Reports — Admin",
};

const statCards = [
  { title: "Approved Applications", key: "approved" },
  { title: "Pending Applications", key: "pending" },
  { title: "Rejected", key: "rejected" },
] as const;

export default async function AdminReportsPage() {
  await requireStaff();
  const configured = isSupabaseConfigured();

  const supabase = configured ? await createServerClient() : null;
  const [approved, pending, rejected, apps, anns] = supabase
    ? await Promise.all([
        supabase.from("club_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("club_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("club_applications").select("id", { count: "exact", head: true }).eq("status", "rejected"),
        supabase.from("club_applications").select("id", { count: "exact", head: true }),
        supabase.from("announcements").select("id", { count: "exact", head: true }).eq("published", true),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const counts = {
    approved: approved.count ?? "Unavailable",
    pending: pending.count ?? "Unavailable",
    rejected: rejected.count ?? "Unavailable",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Reports"
        subtitle="Platform activity and activity snapshots for the student organization office."
      />

      {!configured && (
        <div className="mb-6 rounded-card border border-orange/30 bg-orange/10 p-4 text-sm leading-6 text-ink">
          <strong>Supabase is not configured.</strong> Configure Supabase to show live
          counts from club applications and announcements.
        </div>
      )}

      <section aria-label="Summary stats" className="grid gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <div key={s.key} className="rounded-card border border-black/5 bg-card p-5 shadow-sm">
            <p className="text-sm font-medium text-muted">{s.title}</p>
            <p className="mt-2 text-3xl font-bold text-ink">{counts[s.key]}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-black/5 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink">What this report covers</h2>
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-muted">Counts reflect stored club applications and published school announcements. An application is not necessarily an active club.</p>
            <p className="text-sm leading-6 text-muted">Attendance, funding and engagement trends are not collected by this report. No estimated activity figures are shown.</p>
          </div>
        </div>

        <div className="flex flex-col items-start justify-center rounded-card border border-black/5 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Live activity</h2>
          <p className="mt-1 text-sm text-muted">
            {anns.count ?? "Unavailable"} published announcements and {apps.count ?? "Unavailable"} club
            applications on file.
          </p>
          <Link
            href="/admin/clubs"
            className="mt-6 w-fit rounded-full bg-navy px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-navy-dark"
          >
            Review club applications →
          </Link>
        </div>
      </div>
    </div>
  );
}
