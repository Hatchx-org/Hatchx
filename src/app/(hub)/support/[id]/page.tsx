import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import SupportStatusForm from "../../admin/support/status-form";
import FaqPublisher from "../../admin/support/faq-publisher";
import SupportReplyForm from "./reply-form";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SupportRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=${encodeURIComponent(`/support/${id}`)}`);
  if (!isSupabaseConfigured()) notFound();
  const db = await createServerClient();
  const [{ data: request }, { data: updates }, { data: faq }] = await Promise.all([
    db.from("support_requests").select("*").eq("id", id).maybeSingle(),
    db.from("support_request_updates").select("*").eq("request_id", id).eq("internal", false).order("created_at"),
    user.role === "admin" ? db.from("support_faqs").select("id,question,answer,published").eq("source_request_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!request) notFound();
  const isStaff = await hasPermission("support.manage");
  return <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-6 lg:py-12">
    <Link href={isStaff ? "/admin/support" : "/support#my-requests"} className="text-sm font-bold text-powder">← Back to support</Link>
    <header className="mt-5 rounded-[22px] border border-line bg-card p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-powder">{request.request_type.replaceAll("_", " ")}</p><h1 className="mt-2 text-3xl font-bold text-ink">{request.subject}</h1><p className="mt-2 text-sm text-muted">Opened {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.created_at))}</p></div><span className="rounded-full bg-navy px-4 py-2 text-xs font-bold uppercase text-cream">{request.status.replaceAll("_", " ")}</span></div><p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-ink">{request.details}</p>{isStaff ? <div className="mt-5 border-t border-line pt-5"><SupportStatusForm id={request.id} status={request.status} /></div> : null}</header>
    <section className="mt-6 rounded-[22px] border border-line bg-card p-6 shadow-sm" aria-labelledby="conversation-title"><div className="flex items-center justify-between gap-3"><h2 id="conversation-title" className="text-xl font-bold text-ink">Conversation</h2><span className="text-xs text-muted">{updates?.length ?? 0} replies</span></div>{updates?.length ? <ol className="mt-4 space-y-3">{updates.map((update) => { const mine = update.author_id === user.id; return <li key={update.id} className={`rounded-control p-4 ${mine ? "ml-6 bg-navy text-cream" : "mr-6 bg-content-bg text-ink"}`}><div className="flex items-center justify-between gap-3 text-xs"><strong>{mine ? "You" : "Support team"}</strong><time dateTime={update.created_at} className={mine ? "text-cream/60" : "text-muted"}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(update.created_at))}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{update.body}</p></li>; })}</ol> : <p className="mt-4 rounded-control bg-content-bg p-5 text-sm text-muted">No replies yet. Add a message below if you have more information.</p>}<SupportReplyForm requestId={request.id} /></section>
    {user.role === "admin" ? <FaqPublisher requestId={request.id} subject={request.subject} faq={faq ?? null}/> : null}
  </div>;
}
