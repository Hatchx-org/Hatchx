import Link from "next/link";
import AnnouncementBoard from "@/components/announcement-board";
import BellSchedule from "@/components/bell-schedule";
import { CalendarIcon, MegaphoneIcon, SearchIcon } from "@/components/icons";
import { getAnnouncementTags, getAnnouncementsPage } from "@/lib/announcements";
import { getEvents } from "@/lib/events";
import { isEventUpcoming } from "@/lib/data";
import CalendarBoard from "../calendar/calendar-board";

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ tag?: string; page?: string; q?: string; view?: string }> }) {
  const { tag, page: rawPage, q = "", view: rawView } = await searchParams;
  const view = rawView === "calendar" || rawView === "schedule" ? rawView : "updates";
  const page = Number.parseInt(rawPage ?? "1", 10);
  const query = q.trim().slice(0, 80);
  const [tagsFromDb, events] = await Promise.all([getAnnouncementTags(), getEvents()]);
  const tags = ["All", ...tagsFromDb];
  const active = tag && tags.includes(tag) ? tag : "All";
  const result = await getAnnouncementsPage(Number.isFinite(page) ? page : 1, active === "All" ? undefined : active, undefined, query);
  const upcoming = events.filter((event) => event.dateISO && isEventUpcoming(event)).sort((a, b) => `${a.dateISO}${a.time}`.localeCompare(`${b.dateISO}${b.time}`)).slice(0, 4);
  const filterQuery = (nextTag: string) => {
    const params = new URLSearchParams();
    if (nextTag !== "All") params.set("tag", nextTag);
    if (query) params.set("q", query);
    return params.size ? `/announcements?${params}` : "/announcements";
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:py-12">
      <nav aria-label="Updates and calendar sections" className="sticky top-0 z-20 mb-6 grid w-full grid-cols-3 gap-1 overflow-hidden rounded-[18px] border border-line bg-card/95 p-2 shadow-sm backdrop-blur-xl sm:static sm:w-fit sm:gap-2">
        {([
          { value: "updates", label: "Updates", href: "/announcements" },
          { value: "calendar", label: "Calendar", href: "/announcements?view=calendar" },
          { value: "schedule", label: "Bell Schedule", href: "/announcements?view=schedule" },
        ] as const).map((item) => <Link key={item.value} href={item.href} aria-current={view === item.value ? "page" : undefined} className={`min-w-0 whitespace-nowrap rounded-xl px-1 py-2.5 text-center text-xs font-bold sm:px-5 sm:text-sm ${view === item.value ? "bg-navy text-cream" : "text-muted hover:bg-content-bg hover:text-ink"}`}>{item.label}</Link>)}
      </nav>

      <header className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-powder">Your school day at a glance</p>
          <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-6xl">Updates &amp; Calendar</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">Read important updates, check upcoming dates, and find today&apos;s bell times in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/announcements/submit" className="inline-flex h-11 items-center rounded-full bg-navy px-5 text-sm font-bold text-cream">Submit announcement</Link><Link href="/announcements/archive" className="inline-flex h-11 items-center rounded-full border border-line bg-card px-5 text-sm font-bold text-ink">Archive</Link></div>
      </header>

      {view === "updates" ? <>
      <section className="mt-6 rounded-[18px] border border-line bg-card p-4 shadow-sm sm:p-5" aria-label="Search and filter announcements">
        <form role="search" className="flex gap-2">
          {active !== "All" ? <input type="hidden" name="tag" value={active} /> : null}
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search announcements</span><SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" /><input name="q" defaultValue={query} maxLength={80} placeholder="Search titles and announcement text" className="h-12 w-full rounded-full border border-line bg-content-bg pl-12 pr-4 text-sm text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/20" /></label>
          <button className="h-12 rounded-full bg-navy px-6 text-sm font-bold text-cream">Search</button>
        </form>
        <nav aria-label="Filter announcements by topic" className="mt-4 flex gap-2 overflow-x-auto pb-1">{tags.map((item) => <Link key={item} href={filterQuery(item)} aria-current={active === item ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${active === item ? "bg-navy text-cream" : "border border-line text-muted hover:text-ink"}`}>{item}</Link>)}</nav>
      </section>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main aria-labelledby="announcement-feed-title">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Announcement feed</p><h2 id="announcement-feed-title" className="mt-1 text-2xl font-bold text-ink">{query ? `Results for “${query}”` : active === "All" ? "Latest announcements" : active}</h2></div>{(query || active !== "All") ? <Link href="/announcements" className="text-sm font-semibold text-navy">Clear filters</Link> : null}</div>
          {result.announcements.length ? <AnnouncementBoard announcements={result.announcements} /> : <div className="rounded-card border border-dashed border-line bg-card px-6 py-14 text-center"><p className="font-semibold text-ink">No matching announcements</p><p className="mt-2 text-sm text-muted">Try a broader keyword or a different topic.</p><Link href="/announcements" className="mt-4 inline-flex text-sm font-bold text-navy">Clear filters</Link></div>}
          {result.pageCount > 1 ? <nav aria-label="Announcement pages" className="mt-8 flex items-center justify-center gap-3">{result.page > 1 ? <Link href={`/announcements?${new URLSearchParams({ ...(active !== "All" ? { tag: active } : {}), ...(query ? { q: query } : {}), page: String(result.page - 1) })}`} className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink">Previous</Link> : null}<span className="text-sm text-muted">Page {result.page} of {result.pageCount}</span>{result.page < result.pageCount ? <Link href={`/announcements?${new URLSearchParams({ ...(active !== "All" ? { tag: active } : {}), ...(query ? { q: query } : {}), page: String(result.page + 1) })}`} className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink">Next</Link> : null}</nav> : null}
        </main>

        <aside className="space-y-4">
          <section className="rounded-[18px] border border-line bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-ink">Coming up</h2><Link href="/announcements?view=calendar" className="text-xs font-bold text-navy">Full calendar →</Link></div><div className="mt-3 divide-y divide-line">{upcoming.length ? upcoming.map((event) => <Link key={event.id} href={`/events/${event.id}`} className={`flex gap-3 py-3 first:pt-0 ${event.meetingEffect ? "text-red-700" : ""}`}><time className={`w-12 shrink-0 text-xs font-bold uppercase ${event.meetingEffect ? "text-red-700" : "text-navy"}`}>{event.dateISO ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${event.dateISO}T00:00:00`)) : "TBA"}</time><span className="min-w-0"><span className="block truncate text-sm font-semibold">{event.meetingEffect ? "NO MEETINGS · " : ""}{event.title}</span><span className="mt-0.5 block truncate text-xs text-muted">{event.meetingEffect === "club" && event.affectedClubName ? `${event.affectedClubName} meeting cancelled` : event.meetingEffect === "all" ? "All Club meetings cancelled" : `${event.time} · ${event.location}`}</span></span></Link>) : <p className="py-3 text-sm text-muted">No upcoming events.</p>}</div></section>
          <section className="rounded-[18px] border border-line bg-card p-5 shadow-sm"><h2 className="font-bold text-ink">Quick actions</h2><div className="mt-3 grid gap-2"><Link href="/announcements?view=schedule" className="flex items-center gap-3 rounded-control bg-content-bg p-3 text-sm font-semibold text-ink"><CalendarIcon className="size-5 text-navy" />View bell schedule</Link><Link href="/announcements/archive" className="flex items-center gap-3 rounded-control bg-content-bg p-3 text-sm font-semibold text-ink"><MegaphoneIcon className="size-5 text-navy" />Search the archive</Link><a href="/calendar.ics" className="flex items-center gap-3 rounded-control bg-content-bg p-3 text-sm font-semibold text-ink"><CalendarIcon className="size-5 text-navy" />Add calendar to phone</a></div></section>
          <section className="rounded-[18px] border border-line bg-card p-5 shadow-sm"><h2 className="font-bold text-ink">How this works</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-muted"><li>• The feed opens with unread announcements only.</li><li>• Open or mark an announcement as read to remove it from the default feed.</li><li>• Read and saved status stays on this device.</li><li>• School-wide submissions are reviewed before publishing.</li></ul><Link href="/announcements/submit" className="mt-4 inline-flex text-sm font-bold text-navy">Submit for review →</Link></section>
        </aside>
      </div></> : null}

      {view === "calendar" ? <section id="calendar" className="mt-7" aria-labelledby="calendar-title">
        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Plan ahead</p><h2 id="calendar-title" className="mt-1 text-2xl font-bold text-ink">School calendar</h2></div>
        <CalendarBoard events={events} />
      </section> : null}

      {view === "schedule" ? <div className="mt-7"><BellSchedule /></div> : null}
    </div>
  );
}
