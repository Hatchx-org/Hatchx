import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import Pagination from "@/components/pagination";
import PushNotificationControl from "@/components/push-notification-control";
import SelectAll from "./select-all";
import { bulkNotificationAction, markAllNotificationsRead } from "./actions";

const PAGE_SIZE = 20;
const kinds = ["announcement", "emergency_announcement", "announcement_review", "support_request", "club_application", "membership_request", "consent_due", "event_registration", "waitlist"];

function safeDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string; from?: string; to?: string; page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const params = await searchParams;
  const status = params.status === "unread" || params.status === "read" ? params.status : "all";
  const kind = kinds.includes(params.kind ?? "") ? params.kind ?? "" : "";
  const from = safeDate(params.from);
  const to = safeDate(params.to);
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const db = await createServerClient();
  let query = db.from("notifications").select("*", { count: "exact" }).eq("user_id", user.id).is("deleted_at", null);
  if (status === "unread") query = query.is("read_at", null);
  if (status === "read") query = query.not("read_at", "is", null);
  if (kind) query = query.eq("kind", kind);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  const fromRow = (requestedPage - 1) * PAGE_SIZE;
  const rows = await query.order("created_at", { ascending: false }).range(fromRow, fromRow + PAGE_SIZE - 1);
  const pageCount = Math.max(1, Math.ceil((rows.count ?? 0) / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const paginationQuery = Object.fromEntries(Object.entries({ status: status === "all" ? "" : status, kind, from, to }).filter(([, value]) => value));
  if (requestedPage > pageCount) {
    const queryString = new URLSearchParams({ ...paginationQuery, page: String(pageCount) }).toString();
    redirect(`/notifications?${queryString}`);
  }

  return <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8"><header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-powder">Inbox</p><h1 className="mt-2 text-4xl font-bold text-ink">Notifications</h1><p className="mt-2 text-muted">Live announcements, decisions, reminders, and emergency alerts.</p></div><form action={markAllNotificationsRead}><button className="text-sm font-semibold text-navy">Mark all read</button></form></header>

    <section className="mt-6 grid gap-4 rounded-card border border-line bg-card p-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><h2 className="font-bold text-ink">Browser &amp; PWA push</h2><p className="mt-1 text-sm text-muted">Receive alerts even when Hatchx is not open. Emergency announcements remain visible until dismissed.</p></div><PushNotificationControl /></section>

    <form className="mt-5 grid gap-3 rounded-card border border-line bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"><select name="status" defaultValue={status} className="h-10 rounded-control border border-line bg-content-bg px-3 text-sm"><option value="all">All status</option><option value="unread">Unread</option><option value="read">Read</option></select><select name="kind" defaultValue={kind} className="h-10 rounded-control border border-line bg-content-bg px-3 text-sm"><option value="">All types</option>{kinds.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><label className="text-xs text-muted">From<input type="date" name="from" defaultValue={from} className="mt-1 h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm" /></label><label className="text-xs text-muted">To<input type="date" name="to" defaultValue={to} className="mt-1 h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm" /></label><button className="h-10 self-end rounded-full bg-navy px-4 text-sm font-bold text-cream">Filter</button></form>

    {rows.error ? <p className="mt-6 rounded-card border border-orange/40 bg-card p-5">Run <code>realtime_notifications_dashboard.sql</code> to enable the upgraded notification center.</p> : <form id="notification-selection" action={bulkNotificationAction} className="mt-6"><div className="mb-3 flex flex-wrap items-center gap-3"><SelectAll formId="notification-selection" /><button name="operation" value="read" className="text-xs font-bold text-navy">Mark selected read</button><button name="operation" value="unread" className="text-xs font-bold text-navy">Mark selected unread</button><button name="operation" value="delete" className="text-xs font-bold text-orange">Delete selected</button><span className="ml-auto text-xs text-muted">{rows.count ?? 0} notifications</span></div><div className="space-y-3">{rows.data?.map((notification) => { const emergency = notification.kind === "emergency_announcement"; return <article key={notification.id} className={`rounded-card border p-5 ${emergency ? "border-red-500 bg-red-50 shadow-sm" : notification.read_at ? "border-line bg-card" : "border-navy/30 bg-card shadow-sm"}`}><div className="flex gap-4"><input type="checkbox" name="notification_id" value={notification.id} aria-label={`Select ${notification.title}`} className="mt-1 size-4 shrink-0" /><div className="min-w-0 flex-1"><p className={`text-xs font-bold uppercase tracking-wider ${emergency ? "text-red-700" : "text-muted"}`}>{notification.kind.replaceAll("_", " ")}</p><h2 className={`mt-1 font-bold ${emergency ? "text-red-950" : "text-ink"}`}>{notification.title}</h2><p className={`mt-2 text-sm leading-6 ${emergency ? "text-red-900" : "text-muted"}`}>{notification.body}</p><time dateTime={notification.created_at} className="mt-2 block text-xs text-muted">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.created_at))}</time>{notification.href ? <Link href={notification.href} className={`mt-3 inline-block text-sm font-bold ${emergency ? "text-red-800" : "text-navy"}`}>Open →</Link> : null}</div>{!notification.read_at ? <span className="size-2 shrink-0 rounded-full bg-orange" title="Unread" /> : null}</div></article>; })}{!rows.data?.length ? <p className="rounded-card border border-line bg-card p-8 text-center text-muted">No notifications match these filters.</p> : null}</div></form>}
    <Pagination basePath="/notifications" page={page} total={rows.count ?? 0} pageSize={PAGE_SIZE} query={paginationQuery} />
  </div>;
}
