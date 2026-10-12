import type { MetadataRoute } from "next";
import { getAnnouncements } from "@/lib/announcements";
import { getAllClubs } from "@/lib/clubs";
import { getEvents } from "@/lib/events";
import { getOpportunities } from "@/lib/opportunities";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [announcements, clubs, events, opportunities] = await Promise.all([
    getAnnouncements(100),
    getAllClubs(),
    getEvents(),
    getOpportunities(),
  ]);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const paths = [
    "",
    "/announcements",
    "/clubs",
    "/events",
    "/sports",
    "/opportunities",
    "/opportunities/all",
    "/opportunities/internships",
    "/opportunities/scholarships",
    "/opportunities/pre-college",
    "/opportunities/community-service",
    "/support",
    "/about",
  ];
  const details = [
    ...announcements.map((item) => `/announcements/${item.id}`),
    ...clubs.map((item) => `/clubs/${item.slug}`),
    ...events.map((item) => `/events/${item.id}`),
    ...opportunities.map((item) => `/opportunities/${item.id}`),
  ];
  return [...paths, ...details].map((path) => ({ url: `${origin}${path}` }));
}
