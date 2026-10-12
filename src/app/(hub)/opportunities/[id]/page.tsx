import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, Button } from "@/components/ui";
import { getOpportunity } from "@/lib/opportunities";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const opportunity = await getOpportunity(id);
  return opportunity ? { title: opportunity.title, description: opportunity.description } : { title: "Opportunity not found" };
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const o = await getOpportunity(id);
  if (!o) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        eyebrow={o.type}
        title={o.title}
        subtitle={`${o.date} · Bayside High School`}
        actions={<Link href="/opportunities" className="text-sm font-semibold text-powder hover:text-cream">← All Opportunities</Link>}
      />

      <div className="rounded-card border border-line bg-card p-6 shadow-sm">
        <dl className="space-y-3 text-sm">
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-semibold text-ink">Type:</dt>
            <dd className="text-muted">{o.type}</dd>
          </div>
          {o.eligibility && <div className="flex gap-3"><dt className="w-24 shrink-0 font-semibold text-ink">Eligibility:</dt><dd className="leading-6 text-muted">{o.eligibility}</dd></div>}
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-semibold text-ink">Date:</dt>
            <dd className="text-muted">{o.date}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-24 shrink-0 font-semibold text-ink">Description:</dt>
            <dd className="leading-6 text-muted">{o.description}</dd>
          </div>
        </dl>
        <div className="mt-6">
          <Button href={o.applicationLink ?? "/login"} variant="peach">Apply Now</Button>
        </div>
      </div>
    </div>
  );
}
