import Link from "next/link";
import { AnnouncementCard } from "@/components/cards";
import { getArchivedAnnouncements } from "@/lib/announcements";

export default async function AnnouncementsArchivePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const archived = await getArchivedAnnouncements(100, from, to);
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="page-title-card mb-8">
        <Link href="/announcements" className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-powder hover:text-powder">← Back</Link>
        <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">Announcement Archive</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-muted">Announcements archived by Hatchx administrators, newest first.</p>
      </header>
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-line bg-card p-4">
        <label className="grid gap-1 text-xs font-semibold text-muted">From<input type="date" name="from" defaultValue={from} className="h-10 rounded-control border border-line bg-content-bg px-3 text-sm text-ink" /></label>
        <label className="grid gap-1 text-xs font-semibold text-muted">To<input type="date" name="to" defaultValue={to} className="h-10 rounded-control border border-line bg-content-bg px-3 text-sm text-ink" /></label>
        <button type="submit" className="h-10 rounded-full bg-navy px-5 text-sm font-semibold text-cream">Filter</button>
        {(from || to) && <Link href="/announcements/archive" className="h-10 px-3 py-2 text-sm font-semibold text-powder">Clear</Link>}
      </form>
      {archived.length > 0 ? (
        <div className="space-y-4">{archived.map((announcement) => <AnnouncementCard key={announcement.id} a={announcement} />)}</div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-card/60 px-6 py-12 text-center text-sm text-muted">No announcements have been archived yet.</p>
      )}
    </div>
  );
}
