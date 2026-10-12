import type { Metadata } from "next";
import Link from "next/link";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { updateClubTags } from "./actions";

export const metadata: Metadata = { title: "Club Tags — Admin" };

export default async function AdminClubTagsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = (await searchParams).q?.trim() ?? "";
  const db = await createServerClient();
  let query = db.from("clubs").select("id,slug,name,status,interest_tags").order("name").limit(500);
  if (q) query = query.ilike("name", `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  const { data: clubs, error } = await query;
  const tagCounts = new Map<string, number>();
  for (const club of clubs ?? []) for (const tag of club.interest_tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const allTags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return <div className="mx-auto w-full max-w-6xl px-6 py-8">
    <PageHeader title="Club Tag Manager" subtitle="View and maintain the discovery tags used by every Club. Each Club can use 1–3 custom tags; the first is its primary category." />
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <Link href="/admin/clubs" className="text-sm font-bold text-navy">← Club applications</Link>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search Clubs" className="h-10 rounded-control border border-line bg-card px-3 text-sm"/><button className="rounded-full bg-navy px-4 text-sm font-bold text-cream">Search</button></form>
    </div>

    <section className="mt-6 rounded-card border border-line bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-bold text-ink">All tags</h2><p className="text-xs text-muted">{allTags.length} unique tags across {clubs?.length ?? 0} Clubs</p></div>
      <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-auto">{allTags.map(([tag, count]) => <span key={tag} className="rounded-full bg-content-bg px-3 py-1 text-xs font-semibold text-ink">{tag} <span className="text-muted">{count}</span></span>)}</div>
    </section>

    {error ? <p role="alert" className="mt-6 rounded-control border border-orange/30 bg-orange/10 p-4 text-sm">Club tags could not be loaded.</p> : null}
    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      {(clubs ?? []).map((club) => <article key={club.id} className="rounded-card border border-line bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-ink">{club.name}</h2><p className="text-xs text-muted">{club.status}</p></div><Link href={`/clubs/${club.slug}`} className="text-xs font-bold text-navy">View profile →</Link></div>
        <ActionFeedbackForm action={updateClubTags} className="mt-4 grid gap-2">
          <input type="hidden" name="club_id" value={club.id}/><input type="hidden" name="slug" value={club.slug}/>
          {[0, 1, 2].map((index) => <input key={index} name="interest_tags" required={index === 0} minLength={2} maxLength={30} defaultValue={club.interest_tags?.[index] ?? ""} placeholder={`Tag ${index + 1}${index ? " (optional)" : " (primary)"}`} className="h-10 rounded-control border border-line bg-content-bg px-3 text-sm"/>)}
          <button className="mt-1 h-10 rounded-full bg-navy px-4 text-sm font-bold text-cream">Save tags</button>
        </ActionFeedbackForm>
      </article>)}
    </section>
    {!error && !clubs?.length ? <p className="mt-6 rounded-card border border-dashed border-line p-8 text-center text-sm text-muted">No Clubs match this search.</p> : null}
  </div>;
}
