import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AnnouncementActions from "@/components/announcement-actions";
import AnnouncementBody from "@/components/announcement-body";
import { AnnouncementCard } from "@/components/cards";
import { getAnnouncement, getAnnouncements } from "@/lib/announcements";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const announcement = await getAnnouncement(id);
  return announcement ? { title: announcement.title, description: announcement.excerpt.slice(0, 160) } : { title: "Announcement not found" };
}

export const dynamic = "force-dynamic";

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [announcement, latest] = await Promise.all([getAnnouncement(id), getAnnouncements(5)]);
  if (!announcement) notFound();
  const related = latest.filter((item) => item.id !== id).slice(0, 2);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 lg:py-12">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted"><Link href="/announcements" className="font-semibold text-powder hover:text-ink">Announcements</Link><span aria-hidden>/</span><span className="line-clamp-1">{announcement.title}</span></nav>

      <article className={`mt-5 overflow-hidden rounded-[26px] border shadow-sm ${announcement.priority === "emergency" ? "border-red-500 bg-red-50 ring-2 ring-red-500/25" : "border-line bg-card"}`}>
        {announcement.priority === "emergency" ? <div className="bg-red-700 px-6 py-3 text-center text-sm font-black uppercase tracking-[0.2em] text-white sm:px-10">Emergency alert</div> : null}
        {announcement.imageUrl ? <div className="relative aspect-[16/7] w-full"><Image src={announcement.imageUrl} alt={announcement.imageAlt ?? ""} fill priority sizes="(max-width: 1200px) 100vw, 1152px" className="object-cover" /></div> : null}
        <div className="p-6 sm:p-10 lg:p-12">
          <div className="flex flex-wrap items-center gap-3 text-xs"><span className={`rounded-full px-3 py-1 font-semibold ${announcement.priority === "emergency" ? "bg-red-600 text-white" : "bg-navy text-cream"}`}>{announcement.priority === "emergency" ? "Immediate action required" : announcement.tag}</span><time className={announcement.priority === "emergency" ? "text-red-800" : "text-muted"}>Published {announcement.date}</time></div>
          <h1 className={`mt-5 max-w-5xl font-display text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl ${announcement.priority === "emergency" ? "text-red-950" : "text-ink"}`}>{announcement.title}</h1>
          <div className="mt-7 border-y border-line py-4"><AnnouncementActions title={announcement.title} /></div>
          <div className={`prose-announcement mt-8 max-w-3xl whitespace-pre-wrap text-base leading-8 sm:text-lg ${announcement.priority === "emergency" ? "font-medium text-red-950" : "text-muted"}`}><AnnouncementBody body={announcement.excerpt} /></div>
        </div>
      </article>

      {related.length ? <section className="mt-10" aria-labelledby="related-announcements"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Keep reading</p><h2 id="related-announcements" className="mt-1 font-display text-2xl font-bold uppercase text-ink">More announcements</h2></div><Link href="/announcements" className="text-sm font-semibold text-navy">View all →</Link></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{related.map((item) => <AnnouncementCard key={item.id} a={item} />)}</div></section> : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm"><Link href="/announcements" className="font-semibold text-powder hover:text-ink">← Back to announcements</Link><div className="flex gap-4"><Link href="/announcements?view=calendar" className="font-semibold text-muted hover:text-ink">Calendar</Link><Link href="/announcements/archive" className="font-semibold text-muted hover:text-ink">Archive</Link></div></div>
    </div>
  );
}
