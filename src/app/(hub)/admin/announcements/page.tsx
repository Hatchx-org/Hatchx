import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import AnnouncementForm from "./announcement-form";
import Pagination from "@/components/pagination";
import DeleteAnnouncementButton from "./delete-announcement-button";
import { requirePermission } from "@/lib/permissions";

const PAGE_SIZE = 20;
async function requestTime() { return Date.now(); }

export const metadata: Metadata = {
  title: "Post Announcement — Admin",
};

export default async function AdminAnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePermission("announcements.manage", "/admin/announcements");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const now = await requestTime();
  const configured = isSupabaseConfigured();

  const supabase = configured ? await createServerClient() : null;
  const { data: clubs } = supabase ? await supabase.from("clubs").select("id,name").eq("status", "published").order("name") : { data: [] };
  let { data: rows, count, error: listError } = supabase
    ? await supabase
        .from("announcements")
        .select("id, title, tag, created_at, archived_at, publish_at, published, priority, pinned_until, expires_at, audience_type", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
    : { data: null, count: 0, error: null };
  if (supabase && listError?.code === "42703") {
    const fallback = await supabase.from("announcements").select("id,title,tag,created_at,archived_at,published", { count: "exact" }).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    rows = fallback.data?.map((row) => ({ ...row, publish_at: null, priority: "normal" as const, pinned_until: null, expires_at: null, audience_type: "school" as const })) ?? null;
    count = fallback.count;
    listError = fallback.error;
  }
  const { data: draft } = supabase ? await supabase.from("announcement_drafts").select("*").eq("user_id", user.id).eq("draft_key", "new").maybeSingle() : { data: null };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="Post Announcement"
        subtitle="Draft safely, preview, publish now or schedule a future announcement."
      />

      {!configured && (
        <div className="mb-6 rounded-card border border-orange/30 bg-orange/10 p-4 text-sm leading-6 text-ink">
          <strong>Supabase is not configured.</strong> Add{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="font-mono text-xs">.env.local</code>, then apply{" "}
          <code className="font-mono text-xs">supabase/schema.sql</code> in the Supabase
          SQL Editor to publish and manage announcements.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-black/5 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink">New announcement</h2>
          <AnnouncementForm disabled={!configured} draft={draft} clubs={clubs ?? []} />
        </section>

        <section className="rounded-card border border-black/5 bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold text-ink">Announcements</h2>
          {!configured ? (
            <p className="mt-6 text-center text-sm text-muted">
              Announcements will appear here once Supabase is connected.
            </p>
          ) : !rows || rows.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">
              No announcements yet. Publish your first one on the left.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-black/5">
              {rows.map((row) => (
                <li key={row.id} className={`flex items-center justify-between gap-3 py-3 ${row.priority === "emergency" ? "rounded-control bg-red-50 px-3 ring-1 ring-red-300" : ""}`}>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${row.priority === "emergency" ? "text-red-900" : "text-ink"}`}>{row.priority === "emergency" ? "EMERGENCY · " : ""}{row.title}</p>
                    <p className="text-xs text-muted">
                      {row.tag} ·{" "}
                      {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                        new Date(row.created_at),
                      )} · {row.archived_at ? "Archived" : "publish_at" in row && row.publish_at && new Date(row.publish_at).getTime() > now ? "Scheduled" : row.expires_at && new Date(row.expires_at).getTime() <= now ? "Expired" : row.published ? "Published" : "Draft"}{row.audience_type === "grades" ? " · Selected grades" : row.audience_type === "clubs" ? " · Club members" : " · Entire school"}{row.priority !== "normal" ? ` · ${row.priority}` : ""}{row.pinned_until && new Date(row.pinned_until).getTime() > now ? " · Pinned" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(!row.publish_at || new Date(row.publish_at).getTime() <= now || row.archived_at) && <Link
                      href={`/announcements/${row.id}`}
                      className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-ink transition-colors hover:border-navy hover:text-navy"
                    >
                      View
                    </Link>}
                    <Link href={`/admin/announcements/${row.id}`} className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-ink">Edit</Link>
                    <DeleteAnnouncementButton id={row.id} archived={Boolean(row.archived_at)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <Pagination basePath="/admin/announcements" page={page} total={count ?? 0} pageSize={PAGE_SIZE} />
    </div>
  );
}
