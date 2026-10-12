import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import Pagination from "@/components/pagination";
import ApplicationActions from "./application-actions";

const PAGE_SIZE = 25;

export const metadata: Metadata = {
  title: "Manage Clubs — Admin",
};

const statusTabs = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

export default async function AdminClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const { status, page: pageParam } = await searchParams;
  const tab = statusTabs.find((t) => t.key === status)?.key ?? "pending";
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const configured = isSupabaseConfigured();

  const supabase = configured ? await createServerClient() : null;
  const { data: rows, count } = supabase
    ? await supabase
        .from("club_applications")
        .select("id, club_name, category, description, meeting_days, contact_email, status, created_at", { count: "exact" })
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
    : { data: null, count: 0 };

  const badge = {
    pending: "bg-peach/60 text-ink",
    approved: "bg-navy text-cream",
    rejected: "bg-orange/20 text-orange",
  }[tab];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Manage Clubs"
        subtitle="Review teacher-submitted Club proposals. Approval publishes the Club and assigns the submitting teacher as its Advisor automatically."
      />
      <div className="mb-5 flex flex-wrap justify-end gap-2"><Link href="/admin/clubs/tags" className="rounded-full border border-navy px-5 py-2.5 text-sm font-bold text-navy">Manage all Club tags</Link><Link href="/clubs/manage" className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-cream">Manage all Clubs &amp; Teams →</Link></div>

      {!configured && (
        <div className="mb-6 rounded-card border border-orange/30 bg-orange/10 p-4 text-sm leading-6 text-ink">
          <strong>Supabase is not configured.</strong> Apply{" "}
          <code className="font-mono text-xs">supabase/admin_crud.sql</code> in the Supabase
          SQL Editor to review applications from the live queue.
        </div>
      )}

      <nav aria-label="Applications by status" className="mt-2 flex gap-2">
        {statusTabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/clubs?status=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "bg-navy text-cream"
                : "border border-black/10 bg-content-bg text-ink hover:border-navy hover:text-navy"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <section className="mt-6 space-y-4">
        {!configured || !rows || rows.length === 0 ? (
          <div className="rounded-card border border-black/5 bg-card p-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-ink">
              No {tab} applications
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              {configured
                ? "New Club applications will show up here when teachers submit them."
                : "Connect Supabase and run the SQL migration to load the review queue."}
            </p>
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="rounded-card border border-black/5 bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-ink">{row.club_name}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${badge}`}>
                      {tab}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {row.category} · submitted{" "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                      new Date(row.created_at),
                    )}
                    {row.meeting_days ? ` · meets ${row.meeting_days}` : ""}
                  </p>
                </div>
                {tab === "pending" && (
                  <ApplicationActions id={row.id} />
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted">{row.description}</p>
              {row.contact_email && (
                <p className="mt-2 text-xs text-muted">
                  Applicant / future Advisor: <span className="font-medium text-ink">{row.contact_email}</span>
                </p>
              )}
            </article>
          ))
        )}
      </section>
      <Pagination basePath="/admin/clubs" page={page} total={count ?? 0} pageSize={PAGE_SIZE} query={{ status: tab }} />
    </div>
  );
}
