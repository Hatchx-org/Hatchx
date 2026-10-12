import Image from "next/image";
import Link from "next/link";
import { getOpportunities } from "@/lib/opportunities";
import type { Opportunity } from "@/lib/data";

export type OpportunityCategoryConfig = { label: string; heading: string; description: string; image: string; imageAlt: string; types: string[]; searchPlaceholder: string };

function matchesQuery(opportunity: Opportunity, query: string) {
  if (!query) return true;
  return [opportunity.title, opportunity.description, opportunity.eligibility, opportunity.date].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export default async function OpportunityCategoryPage({ config, query }: { config: OpportunityCategoryConfig; query: string }) {
  const all = await getOpportunities();
  const opportunities = all.filter((item) => config.types.includes(item.type)).filter((item) => matchesQuery(item, query));

  return (
    <div className="opportunity-backdrop relative min-h-full overflow-hidden bg-black px-5 py-7 text-ink sm:px-8 lg:px-12">
      <div className="relative mx-auto w-full max-w-[1812px]">
        <Link href="/opportunities" className="text-xs font-bold uppercase tracking-wide text-powder hover:text-ink">← Dashboard</Link>
        <section className="grid items-center gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:px-7 lg:py-16">
          <div className="overflow-hidden rounded-[20px] border-4 border-ink bg-[#263a99]"><Image src={config.image} alt={config.imageAlt} width={808} height={250} priority className="aspect-[808/250] w-full object-cover" /></div>
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-powder">{config.label}</p><h1 className="mt-3 whitespace-pre-line text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">{config.heading}</h1><p className="mt-4 max-w-3xl text-base leading-7 text-muted sm:text-lg">{config.description}</p></div>
        </section>

        <section className="rounded-[20px] bg-[#dcd0be]/95 p-5 text-[#2a2829] sm:p-8 lg:p-10" aria-labelledby="category-results-title">
          <h2 id="category-results-title" className="text-2xl font-bold">{config.label}</h2>
          <form className="mt-5 flex max-w-3xl flex-col gap-3 sm:flex-row" role="search">
            <label htmlFor="opportunity-search" className="sr-only">Search {config.label}</label>
            <input id="opportunity-search" name="q" defaultValue={query} placeholder={config.searchPlaceholder} className="h-11 min-w-0 flex-1 rounded-[8px] bg-[#f0ebe5] px-4 text-sm outline-none placeholder:text-[#6f6a6b] focus:ring-2 focus:ring-[#263a99]" />
            <button className="h-11 rounded-[8px] bg-[#263a99] px-5 text-xs font-bold text-[#f0ebe5]">SEARCH</button>
          </form>
          {opportunities.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{opportunities.map((opportunity) => <OpportunityResultCard key={opportunity.id} opportunity={opportunity} />)}</div> : <div className="mt-6 rounded-[10px] border border-dashed border-[#2a2829]/25 bg-[#f0ebe5]/60 px-6 py-12 text-center"><p className="font-semibold">{query ? "No matching opportunities" : `No active ${config.label.toLocaleLowerCase()} are posted yet.`}</p><p className="mt-2 text-sm text-[#6f6a6b]">{query ? "Try a broader search." : "Check back soon or ask your guidance counselor for current options."}</p></div>}
        </section>
        <footer className="mt-12 flex items-center gap-5 pb-2 text-[10px] font-medium text-ink"><span>{config.label.toUpperCase()}</span><span className="h-px flex-1 bg-ink" /><span className="text-muted">HATCHX</span></footer>
      </div>
    </div>
  );
}

function OpportunityResultCard({ opportunity }: { opportunity: Opportunity }) {
  return <article className="flex min-h-64 flex-col rounded-[10px] bg-[#f0ebe5] px-6 py-5"><p className="text-[11px] font-bold uppercase text-[#263a99]">{opportunity.type}</p><h3 className="mt-3 text-xl font-bold leading-tight">{opportunity.title}</h3><p className="mt-3 flex-1 text-sm leading-6 text-[#6f6a6b]">{opportunity.description}</p><p className="mt-4 text-xs font-bold text-[#263a99]">{opportunity.date}</p><Link href={`/opportunities/${opportunity.id}`} className="mt-4 text-right text-sm font-bold text-[#263a99]" aria-label={`View ${opportunity.title}`}>→</Link></article>;
}
