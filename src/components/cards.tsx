import Link from "next/link";
import Image from "next/image";
import type { Announcement, Club, EventItem } from "@/lib/data";
import { ArrowRightIcon } from "./icons";

export function PrimaryButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-[22px] bg-cream px-7 font-display text-sm font-extrabold tracking-wide text-black shadow-sm transition-all hover:bg-white hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${className}`}
    >
      {children}
    </Link>
  );
}

export function tagClasses(tag: string) {
  switch (tag) {
    case "Events":
      return "bg-orange/90 text-black";
    case "Clubs":
      return "bg-cream text-navy";
    default:
      return "bg-sky/90 text-black";
  }
}

export function AnnouncementCard({ a }: { a: Announcement }) {
  const emergency = a.priority === "emergency";
  return (
    <article>
      <Link
        href={`/announcements/${a.id}`}
        className={`${emergency ? "bg-red-950" : "card-gradient"} group relative flex min-h-40 overflow-hidden rounded-[18px] border transition-all hover:-translate-y-0.5 hover:shadow-lg ${emergency ? "border-red-500 ring-2 ring-red-500/30" : "border-line hover:border-cream/30"}`}
      >
        {emergency ? <span className="absolute inset-x-0 top-0 h-1.5 bg-red-500" aria-hidden /> : null}
        <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {emergency ? <span className="rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white">Emergency alert</span> : <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tagClasses(a.tag)}`}>{a.tag}</span>}
            <time className="text-xs text-cream/55" aria-label={`Published ${a.date}`}>{a.date}</time>
          </div>
          <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-cream sm:text-xl">{a.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-cream/65">{a.excerpt}</p>
          <span className="mt-auto pt-4 text-xs font-bold uppercase tracking-wider text-powder transition-colors group-hover:text-cream">
            Read more →
          </span>
        </div>
        {a.imageUrl ? (
          <div className="relative w-28 shrink-0 sm:w-40 lg:w-48">
            <Image src={a.imageUrl} alt={a.imageAlt ?? ""} fill sizes="(max-width: 640px) 112px, 192px" className="object-cover" />
          </div>
        ) : null}
      </Link>
    </article>
  );
}

export function ClubCard({ club }: { club: Club }) {
  const initials = club.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <Link
      href={`/clubs/${club.slug}`}
      className="card-gradient group flex flex-col items-center rounded-t-[48px] rounded-b-[10px] p-6 text-center transition-transform duration-200 hover:-translate-y-1"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-powder">{club.category}</p>
      <span className={`mt-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${club.recruitingStatus === "closed" ? "bg-white/10 text-cream/60" : club.recruitingStatus === "paused" ? "bg-orange/90 text-black" : "bg-[#d8f3df] text-[#176b35]"}`}>{club.recruitingStatus ?? "Recruiting"}</span>
      <h3 className="mt-2 font-display text-xl font-bold uppercase leading-snug text-cream">{club.name}</h3>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-cream/70">{club.description}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">{(club.tags ?? [club.category]).slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-powder">#{tag}</span>)}</div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px] text-cream/80">
        <span className="rounded-full border border-line px-2.5 py-1">{club.meetingDays.join(", ")}</span>
        <span className="rounded-full border border-line px-2.5 py-1">{club.meetingTime}</span>
        {club.communityService && (
          <span className="rounded-full bg-orange/90 px-2.5 py-1 font-semibold text-black">Community Service</span>
        )}
      </div>
      <div className="relative mt-5 flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-cream shadow-[0_4px_39px_-10px_rgba(252,241,221,0.7)]">
        {club.logo ? <Image src={club.logo} alt={`${club.name} cover`} fill sizes="128px" className="object-cover" /> : <span className="font-display text-4xl font-extrabold text-navy">{initials}</span>}
      </div>
      <span className="mt-5 inline-flex h-10 items-center justify-center rounded-[22px] bg-cream px-6 font-display text-xs font-extrabold tracking-wide text-black transition-colors group-hover:bg-white">
        View Club
      </span>
    </Link>
  );
}

export function EventCard({ event }: { event: EventItem }) {
  const chip =
    event.category === "sports"
      ? "bg-orange/90 text-black"
      : event.category === "spirit-week"
        ? "bg-peach text-black"
        : "bg-sky/90 text-black";
  return (
    <Link
      href={`/events/${event.id}`}
      className={`card-gradient group relative flex min-h-[360px] flex-col overflow-hidden rounded-[34px_34px_10px_10px] border p-7 text-center transition-transform duration-200 hover:-translate-y-1 ${event.meetingEffect ? "border-red-500 ring-2 ring-red-500/25" : "border-line"}`}
    >
      <p className="line-clamp-2 text-xs font-semibold leading-5 text-cream/85">{event.description}</p>
      <div className={`mx-auto mt-3 inline-flex w-fit rounded-full px-4 py-1 text-xs font-semibold ${event.meetingEffect ? "bg-red-600 text-white" : chip}`}>
        {event.meetingEffect ? "No meetings" : event.category === "sports" ? "Sports" : event.category === "spirit-week" ? "Spirit Week" : "Events"}
      </div>
      <h3 className="mt-3 font-display text-xl font-bold uppercase leading-snug text-cream">{event.title}</h3>
      <p className="mt-2 text-xs font-semibold uppercase leading-5 text-cream">{event.date} · {event.meetingEffect === "club" && event.affectedClubName ? `${event.affectedClubName} cancelled` : event.meetingEffect === "all" ? "All Club meetings cancelled" : `${event.location} · ${event.time}`}</p>
      <p className="mt-1 text-sm text-cream/75">{event.price}</p>
      <div className="pointer-events-none absolute -bottom-32 left-1/2 size-64 -translate-x-1/2 rounded-full bg-cream transition-transform group-hover:-translate-y-2" aria-hidden />
      <span className="relative mt-auto inline-flex items-center justify-center gap-1.5 pt-24 text-xs font-bold uppercase tracking-wider text-navy">
        View details
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

export function ViewAllLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-powder transition-colors hover:text-cream"
    >
      {children}
      <ArrowRightIcon className="h-4 w-4" />
    </Link>
  );
}

export function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {href && linkLabel && <ViewAllLink href={href}>{linkLabel}</ViewAllLink>}
    </div>
  );
}
