import { getAnnouncements } from "@/lib/announcements";

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export async function GET() {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const announcements = await getAnnouncements(50, true);
  const items = announcements.map((item) => {
    const link = `${origin}/announcements/${encodeURIComponent(item.id)}`;
    const date = new Date(item.date);
    return `<item><title>${xml(item.title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><description>${xml(item.excerpt)}</description><category>${xml(item.tag)}</category>${Number.isNaN(date.getTime()) ? "" : `<pubDate>${date.toUTCString()}</pubDate>`}</item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Hatchx Announcements</title><link>${xml(`${origin}/announcements`)}</link><description>School notices, Club news, events, and opportunities from Hatchx.</description><language>en-us</language>${items}</channel></rss>`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
