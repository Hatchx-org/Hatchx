import type { Metadata } from "next";
import Link from "next/link";
import { CalendarIcon, ClubsIcon, MegaphoneIcon, OpportunitiesIcon, SearchIcon } from "@/components/icons";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { getSearchResults, type SearchResult } from "@/lib/search";
import ShareSearchButton from "./share-search-button";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };
const kinds = ["All", "Club", "Announcement", "Opportunity", "Event"] as const;
const icons = { Club: ClubsIcon, Announcement: MegaphoneIcon, Opportunity: OpportunitiesIcon, Event: CalendarIcon };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 80);
  const kind = kinds.includes(params.type as (typeof kinds)[number]) ? params.type as (typeof kinds)[number] : "All";
  const allResults = query.length >= 2 ? await getSearchResults(query, 50) : [];
  const results = kind === "All" ? allResults : allResults.filter(result => result.kind === kind);
  if (query.length >= 2 && isSupabaseConfigured()) {
    try { const db = await createServerClient(); await db.rpc("record_search_analytics", { p_query: query, p_result_count: allResults.length }); } catch { /* Search results remain available if analytics fails. */ }
  }
  const hrefFor = (type: string) => `/search?${new URLSearchParams({ q: query, ...(type === "All" ? {} : { type }) })}`;

  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-powder">Hatchx</p>
    <h1 className="mt-2 font-display text-4xl font-bold text-ink sm:text-5xl">Search</h1>
    <form action="/search" role="search" className="mt-7 flex gap-2 rounded-card border border-line bg-card p-3 shadow-sm">
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search the site</span><SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted"/><input type="search" name="q" defaultValue={query} minLength={2} maxLength={80} required autoFocus placeholder="Search clubs, events, announcements, opportunities…" className="h-12 w-full rounded-full border border-line bg-content-bg pl-12 pr-4 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"/></label>
      <button className="h-12 rounded-full bg-navy px-6 text-sm font-bold text-cream">Search</button>
    </form>

    {query.length >= 2 ? <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted"><strong className="text-ink">{allResults.length}</strong> results for “{query}”</p><ShareSearchButton/></div>
      <nav aria-label="Filter search results" className="mt-4 flex gap-2 overflow-x-auto pb-1">{kinds.map(value => <Link key={value} href={hrefFor(value)} aria-current={kind === value ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${kind === value ? "bg-navy text-cream" : "border border-line bg-card text-muted hover:text-ink"}`}>{value}{value !== "All" ? ` (${allResults.filter(result => result.kind === value).length})` : ""}</Link>)}</nav>
      {results.length ? <ol className="mt-6 grid gap-3 md:grid-cols-2">{results.map(result => <ResultCard key={result.href} result={result}/>)}</ol> : <section className="mt-6 rounded-card border border-dashed border-line bg-card px-6 py-14 text-center"><h2 className="font-bold text-ink">No matching results</h2><p className="mt-2 text-sm text-muted">Check the spelling or try a related term. Search understands common synonyms and small typos.</p></section>}
    </> : <section className="mt-8 rounded-card border border-line bg-card p-8 text-center"><h2 className="text-xl font-bold text-ink">Search across Hatchx</h2><p className="mt-2 text-sm text-muted">Enter at least two characters. Results include Clubs, announcements, opportunities, and upcoming events.</p></section>}
  </main>;
}

function ResultCard({ result }: { result: SearchResult }) {
  const Icon = icons[result.kind];
  return <li><Link href={result.href} className="flex h-full gap-4 rounded-card border border-line bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-navy/40"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-content-bg text-navy"><Icon className="size-5"/></span><span className="min-w-0"><span className="text-xs font-bold uppercase tracking-wide text-muted">{result.kind}</span><span className="mt-1 block text-lg font-bold text-ink">{result.title}</span>{result.meta ? <span className="mt-1 block text-sm text-muted">{result.meta}</span> : null}</span></Link></li>;
}
