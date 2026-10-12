import { notFound } from "next/navigation";
import Link from "next/link";
import { getEvent } from "@/lib/events";
import { getCurrentUser } from "@/lib/auth";
import { getEventRsvpInfo, toggleEventRsvp } from "../actions";
import PendingSubmitButton from "@/components/pending-submit-button";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  return event ? { title: event.title, description: event.description } : { title: "Event not found" };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const user = await getCurrentUser();
  const rsvp = await getEventRsvpInfo(event.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:py-12">
      <article className={`relative overflow-hidden rounded-[26px] border p-8 shadow-sm sm:p-12 ${event.meetingEffect ? "border-red-500 bg-red-50 text-red-950 ring-2 ring-red-500/25" : "border-[#97b4de] bg-[#d4cbbc] text-[#2a2829]"}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 font-semibold capitalize text-cream ${event.meetingEffect ? "bg-red-700" : "bg-navy"}`}>
            {event.meetingEffect ? "No meetings" : event.category === "spirit-week" ? "Spirit Week" : event.category}
          </span>
          <span className="rounded-full bg-peach/60 px-3 py-1 font-semibold text-black">
            {event.price}
          </span>
        </div>
        <h1 className="mt-5 font-display text-5xl font-bold uppercase tracking-tight sm:text-7xl">{event.title}</h1>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#263a99]">Date</dt>
            <dd className="mt-0.5 font-medium">{event.date}</dd>
          </div>
          <div>
            <dt className={`text-xs font-semibold uppercase tracking-wide ${event.meetingEffect ? "text-red-700" : "text-[#263a99]"}`}>Status</dt>
            <dd className="mt-0.5 font-medium">{event.meetingEffect === "club" && event.affectedClubName ? `${event.affectedClubName} meeting cancelled` : event.meetingEffect === "all" ? "All Club meetings cancelled" : event.time}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[#263a99]">Location</dt>
            <dd className="mt-0.5 font-medium">{event.location}</dd>
          </div>
        </dl>
        <p className="mt-6 max-w-3xl leading-8 text-[#2a2829]/75">{event.description}</p>

        {!event.meetingEffect && rsvp.available && (
          <div className="mt-6 border-t border-line pt-6">
            {user ? (
              <form action={toggleEventRsvp}>
                <input type="hidden" name="event_id" value={event.id} />
                <PendingSubmitButton
                  pendingLabel="Saving RSVP…"
                  className="inline-flex h-10 items-center gap-2 rounded-[22px] border border-black bg-black px-6 text-sm font-semibold text-white transition-colors hover:bg-black/80"
                >
                  {rsvp.joined ? "✓ I'm going" : "Count me in"}
                  <span className="text-xs text-white/75">({rsvp.count} going)</span>
                </PendingSubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted">
                <Link href={`/login?next=/events/${event.id}`} className="font-semibold text-powder hover:text-cream">
                  Sign in
                </Link>{" "}
                to let organizers know you&apos;re coming ({rsvp.count} going).
              </p>
            )}
          </div>
        )}
      </article>

      <div className="mt-6 text-sm">
        <Link href="/events" className="font-semibold text-powder hover:text-cream">
          ← Back to Events
        </Link>
      </div>
    </div>
  );
}
