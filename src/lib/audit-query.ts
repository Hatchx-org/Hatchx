import { parseOptionalDateOnly } from "./input-validation.ts";

export type AuditSearch = { kind?: string; actor?: string; from?: string; to?: string; resource?: string; operation?: string; q?: string; page?: string };
export const auditResources = ["clubs", "club_memberships", "club_applications", "club_share_links", "club_fundraisers", "club_finance_transactions", "club_trips", "trip_consents", "club_constitution_versions", "club_elections", "club_budgets", "club_reimbursements", "facility_permits", "event_approval_requests", "event_registrations", "events", "opportunities", "support_requests", "support_request_updates", "custom_roles", "custom_role_assignments", "site_content"];

/** Reject malformed filters before querying; dates represent complete UTC days. */
export function parseAuditSearch(search: AuditSearch) {
  const from = parseOptionalDateOnly(search.from ?? "");
  const to = parseOptionalDateOnly(search.to ?? "");
  const actor = (search.actor ?? "").trim();
  const q = (search.q ?? "").normalize("NFKC").trim().slice(0, 120);
  if (from === undefined || to === undefined || (from && to && from > to)) return { error: "Enter a valid date range, with the end on or after the start." } as const;
  if (actor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(actor)) return { error: "Enter an actor’s registered email or full account UUID." } as const;
  if (actor.length > 320) return { error: "Actor filter is too long." } as const;
  const pageNumber = Number(search.page ?? "1");
  return {
    kind: search.kind === "changes" ? "changes" : "roles",
    actor,
    from: from ? `${from}T00:00:00.000Z` : null,
    // Exclusive next-day bound includes fractional timestamps at day's end.
    until: to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000).toISOString() : null,
    resource: auditResources.includes(search.resource ?? "") ? search.resource! : "",
    operation: ["INSERT", "UPDATE", "DELETE"].includes(search.operation ?? "") ? search.operation! : "",
    q,
    page: Number.isSafeInteger(pageNumber) && pageNumber > 0 && pageNumber <= 10000 ? pageNumber : 1,
  } as const;
}
