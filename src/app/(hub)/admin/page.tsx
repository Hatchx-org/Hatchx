import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const user = await requireStaff();
  const configured = isSupabaseConfigured();
  const supabase = configured ? await createServerClient() : null;
  const [pendingResult, usersResult, approvedResult, pendingCountResult, announcementsResult, supportResult] = supabase
    ? await Promise.all([
        supabase.from("club_applications").select("id, club_name, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("club_applications").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("club_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("announcements").select("id", { count: "exact", head: true }).eq("published", true),
        supabase.from("support_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
      ])
    : [{ data: null }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const pending = pendingResult.data?.map((p) => ({
        name: p.club_name,
        action: "Charter review",
        date: new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          new Date(p.created_at),
        ),
      })) ?? [];
  const dashboards = [
    { title: "Members", value: usersResult.count },
    { title: "Approved Club Applications", value: approvedResult.count },
    { title: "Pending Club Applications", value: pendingCountResult.count },
    { title: "Published Announcements", value: announcementsResult.count },
    { title: "Open Support Requests", value: supportResult.count },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Admin"
        subtitle="Review what needs attention now, then open the appropriate management workspace."
      />

      <section aria-label="Dashboard" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dashboards.map((d) => (
          <div key={d.title} className="rounded-card border border-black/5 bg-card p-5 shadow-sm">
            <p className="text-sm font-medium text-muted">{d.title}</p>
            <p className="mt-2 text-2xl font-bold text-ink">{d.value ?? "Unavailable"}</p>
            <p className="mt-1 text-xs font-semibold text-muted">{d.value == null ? "Check database access" : "Live database count"}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-card border border-black/5 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Today&apos;s priorities</h2>
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted">Handle new Club applications, announcement reviews, and Support conversations first. The Notifications inbox now records incoming requests.</p>
            <div className="flex flex-wrap gap-2"><Link href="/notifications" className="inline-flex rounded-full bg-navy px-4 py-2 text-sm text-cream">Open notifications</Link><Link href="/admin/support" className="inline-flex rounded-full border border-line px-4 py-2 text-sm text-ink">Support queue</Link></div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-card border border-black/5 bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Pending Approvals</h2>
              <Link
                href="/admin/clubs"
                className="rounded-full border border-black/10 bg-content-bg px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-navy hover:text-navy"
              >
                Review queue →
              </Link>
            </div>
            {pending.length > 0 ? <ul className="mt-3 divide-y divide-black/5 text-sm">
              {pending.map((p) => (
                <li key={p.name} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold text-ink">{p.name}</p>
                    <p className="text-xs text-muted">{p.action} · {p.date}</p>
                  </div>
                  <Link
                    href="/admin/clubs"
                    className="rounded-full bg-navy px-3.5 py-1.5 text-xs font-semibold text-cream hover:bg-navy-dark"
                  >
                    Approve
                  </Link>
                </li>
              ))}
            </ul> : <p className="mt-4 text-sm text-muted">No applications are waiting for review.</p>}
          </div>

          <div className="rounded-card border border-black/5 bg-card p-6 shadow-sm">
            <h2 className="text-lg font-bold text-ink">Platform Tools</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: "Post Announcement", href: "/admin/announcements" },
                { label: "Manage Clubs", href: "/admin/clubs" },
                { label: "Support Queue", href: "/admin/support" },
                { label: "Opportunities", href: "/admin/opportunities" },
                { label: "Events", href: "/admin/events" },
                { label: "Public Content & FAQs", href: "/manage/site" },
                ...(user.role === "admin" ? [
                  { label: "Manage Users", href: "/admin/users" },
                  { label: "Announcement Review", href: "/admin/review" },
                  { label: "Management Audit", href: "/admin/audit" },
                ] : []),
              ].map((t) => (
                <Link
                  key={t.label}
                  href={t.href}
                  className="rounded-full border border-black/10 bg-content-bg px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-navy hover:text-navy"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
