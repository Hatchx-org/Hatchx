import { EventCard } from "@/components/cards";
import { isEventUpcoming, type EventItem } from "@/lib/data";
import { getEvents } from "@/lib/events";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Events",
};

function EventSection({ title, subtitle, items }: { title: string; subtitle: string; items: EventItem[] }) {
  return (
    <div className="mx-auto w-full max-w-[1700px] px-6 py-10 lg:px-12 lg:py-16">
      <header className="page-title-card mb-12 max-w-[1050px]">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-powder">Bayside High School</p>
        <h1 className="font-display text-[clamp(3.5rem,9vw,6.6rem)] font-semibold uppercase leading-none tracking-[-0.04em] text-cream">{title}</h1>
        <p className="mt-6 max-w-[953px] text-base font-semibold leading-7 text-cream/90 sm:text-xl sm:leading-8">{subtitle}</p>
        <Link href="/events/registration" className="mt-6 inline-flex rounded-full bg-cream px-5 py-2.5 text-sm font-bold text-navy">Event registration &amp; status →</Link>
      </header>
      {items.length > 0 ? (
        <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-card/60 px-6 py-10 text-center text-sm text-muted">
          No upcoming events have been published yet.
        </p>
      )}
    </div>
  );
}

export default async function EventsPage() {
  const events = await getEvents();
  const upcoming = events
    .filter((event) => event.category === "events" && isEventUpcoming(event))
    .sort((a, b) => (a.dateISO ?? "").localeCompare(b.dateISO ?? ""));
  return (
    <EventSection
      title="Events"
      subtitle="Each year Bayside holds engaging events where students take part in creating, designing, and performing. We hope to see you there!"
      items={upcoming.slice(0, 30)}
    />
  );
}
