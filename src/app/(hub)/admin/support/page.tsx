import Link from "next/link";
import { PageHeader } from "@/components/ui";
import Pagination from "@/components/pagination";
import { requirePermission } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import SupportStatusForm from "./status-form";

const PAGE_SIZE = 25;
const statuses = ["open", "in_review", "resolved", "closed"] as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requirePermission("support.manage", "/admin/support");
  const params = await searchParams;
  const requestedStatus = params.status as (typeof statuses)[number] | undefined;
  const status: (typeof statuses)[number] = requestedStatus && statuses.includes(requestedStatus) ? requestedStatus : "open";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = isSupabaseConfigured() ? await createServerClient() : null;
  const { data: requests, count } = supabase
    ? await supabase
        .from("support_requests")
        .select("id, request_type, subject, details, status, requested_for, created_at", { count: "exact" })
        .eq("status", status)
        .order("created_at")
        .range(from, from + PAGE_SIZE - 1)
    : { data: null, count: 0 };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="Support requests" subtitle="Review, assign, and resolve student and club support work." />
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Request status">
        {statuses.map((value) => (
          <Link
            key={value}
            href={`/admin/support?status=${value}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${value === status ? "bg-navy text-cream" : "border border-line text-ink"}`}
          >
            {value.replaceAll("_", " ")}
          </Link>
        ))}
      </nav>
      {requests?.length ? (
        <ul className="space-y-4">
          {requests.map((request) => (
            <li key={request.id} className="rounded-card border border-black/5 bg-card p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">{request.request_type.replaceAll("_", " ")}</p>
                  <h2 className="mt-1 text-lg font-bold text-ink">{request.subject}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">{request.details}</p>
                  {request.requested_for && (
                    <p className="mt-2 text-xs text-muted">
                      Requested for {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.requested_for))}
                    </p>
                  )}
                  <Link href={`/support/${request.id}`} className="mt-3 inline-flex text-sm font-bold text-navy">Open conversation →</Link>
                </div>
                <SupportStatusForm id={request.id} status={request.status} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-line p-8 text-center text-muted">No {status.replaceAll("_", " ")} requests.</p>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} basePath="/admin/support" query={{ status }} />
    </div>
  );
}
