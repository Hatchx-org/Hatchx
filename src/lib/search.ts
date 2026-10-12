import { getAllClubs } from "@/lib/clubs";
import { getAnnouncements } from "@/lib/announcements";
import { isEventUpcoming } from "@/lib/data";
import { getEvents } from "@/lib/events";
import { getOpportunities } from "@/lib/opportunities";
import { rankSearchResults, type SearchResult } from "./search-ranking";

export type { SearchResult } from "./search-ranking";

const SEARCH_SOURCE_LIMIT = 250;

export async function getSearchResults(query: string, limit = 24): Promise<SearchResult[]> {
  const normalized = query.normalize("NFKC").trim();
  if (!normalized) return [];

  const [clubs, announcements, events, opportunities] = await Promise.all([
    getAllClubs(SEARCH_SOURCE_LIMIT),
    getAnnouncements(100),
    getEvents(SEARCH_SOURCE_LIMIT),
    getOpportunities(SEARCH_SOURCE_LIMIT),
  ]);

  const results: SearchResult[] = [
    ...clubs.map((club) => ({
      kind: "Club" as const,
      title: club.name,
      href: `/clubs/${club.slug}`,
      meta: (club.tags ?? [club.category]).join(" · "),
      keywords: `${(club.tags ?? []).join(" ")} ${club.description} ${club.fullDescription ?? ""} ${club.mission ?? ""} ${club.activities ?? ""} ${club.whoShouldJoin ?? ""} ${club.membershipExpectations ?? ""} ${club.meetingDays.join(" ")} ${club.location} ${club.communityService ? "volunteer community service" : ""}`,
    })),
    ...announcements.map((announcement) => ({
      kind: "Announcement" as const,
      title: announcement.title,
      href: `/announcements/${announcement.id}`,
      meta: `${announcement.tag} · ${announcement.date}`,
      keywords: announcement.excerpt,
    })),
    ...opportunities.map((opportunity) => ({
      kind: "Opportunity" as const,
      title: opportunity.title,
      href: `/opportunities/${opportunity.id}`,
      meta: opportunity.type,
      keywords: `${opportunity.description} ${opportunity.eligibility ?? ""}`,
    })),
    ...events.filter((event) => isEventUpcoming(event)).map((event) => ({
      kind: "Event" as const,
      title: event.title,
      href: `/events/${event.id}`,
      meta: event.date,
      keywords: `${event.description} ${event.location} ${event.category}`,
    })),
  ];

  return rankSearchResults(results, normalized, limit);
}
