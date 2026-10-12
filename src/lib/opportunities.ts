import { cache } from "react";
import { opportunities as seedOpportunities, type Opportunity } from "./data";
import { isSupabaseConfigured } from "./supabase/config";
import { createServerClient } from "./supabase/server";
import type { OpportunityRow } from "./supabase/types";
import { developmentFallback } from "./live-data";

const labels: Record<OpportunityRow["category"], string> = {
  election: "Elections",
  community_service: "Community Service",
  internship: "Internships",
  pre_college: "College Prep",
  scholarship: "Scholarships",
  discount: "Student Discounts",
};

function mapOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    title: row.title,
    type: labels[row.category],
    date: row.deadline
      ? `Deadline ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(row.deadline))}`
      : "No deadline listed",
    description: row.description,
    eligibility: row.eligibility ?? undefined,
    applicationLink: row.application_link ?? undefined,
  };
}

export const getOpportunities = cache(async (limit?: number): Promise<Opportunity[]> => {
  const visibleSeed = seedOpportunities.filter((item) => item.type !== "Elections");
  if (!isSupabaseConfigured()) {
    const demoOpportunities = developmentFallback(visibleSeed);
    return limit === undefined ? demoOpportunities : demoOpportunities.slice(0, limit);
  }
  const supabase = await createServerClient();
  let query = supabase
    .from("opportunities")
    .select("*")
    .eq("status", "published")
    .neq("category", "election")
    .or(`deadline.is.null,deadline.gte.${new Date().toISOString()}`)
    .order("deadline", { ascending: true, nullsFirst: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load opportunities: ${error.message}`);
  const live = (data ?? []).map(mapOpportunity);
  return limit === undefined ? live : live.slice(0, limit);
});

export async function getOpportunity(id: string) {
  return (await getOpportunities()).find((item) => item.id === id) ?? null;
}
