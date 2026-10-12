import { EventCard } from "@/components/cards";
import { isEventUpcoming } from "@/lib/data";
import { getEvents } from "@/lib/events";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports",
};

export default async function SportsPage() {
  const events = await getEvents();
  const items = events.filter((e) => e.category === "sports" && isEventUpcoming(e));
  return (
    <div className="mx-auto w-full max-w-[1700px] px-6 py-10 lg:px-12 lg:py-16">
      <header className="page-title-card mb-12 max-w-[1050px]">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-orange">Athletics</p>
        <h1 className="font-display text-[clamp(3.5rem,9vw,6.6rem)] font-semibold uppercase leading-none tracking-[-0.04em] text-cream">
          Sports
        </h1>
        <p className="mt-6 max-w-[953px] text-lg font-semibold leading-8 text-cream lg:text-2xl lg:leading-[30px]">
          View all sport tryout and meeting dates.
        </p>
      </header>
      {items.length > 0 ? (
        <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-dashed border-line bg-card/60 px-6 py-10 text-center text-sm text-muted">
          No upcoming tryouts or meetings have been published yet.
        </p>
      )}
    </div>
  );
}
