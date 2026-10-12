import {
  AnnouncementCard,
  ClubCard,
  EventCard,
  PrimaryButton,
  SectionHeader,
} from "@/components/cards";
import HubShell from "@/components/hub-shell";
import { getAnnouncements } from "@/lib/announcements";
import { getAllClubs } from "@/lib/clubs";
import { isEventUpcoming } from "@/lib/data";
import { getEvents } from "@/lib/events";
import { getOpportunities } from "@/lib/opportunities";
import { getCurrentUser } from "@/lib/auth";
import { getStudentDashboard } from "@/lib/student-dashboard";
import { getSiteText, siteTextDefaults } from "@/lib/site-content";
import { recordServerError } from "@/lib/server-error-reporting";
import HomeDashboard from "@/components/home-dashboard";

export const dynamic = "force-dynamic";

type HomeSection<T> = { data: T; failed: boolean };

async function loadHomeSection<T>(source: string, load: () => Promise<T>, fallback: T, userId?: string): Promise<HomeSection<T>> {
  try {
    return { data: await load(), failed: false };
  } catch (error) {
    await recordServerError(`home-${source}`, error, userId ? { userId } : {});
    return { data: fallback, failed: true };
  }
}

export default async function Home() {
  const user = await getCurrentUser();
  if (user) {
    const [dashboard, announcements, events, opportunities] = await Promise.all([
      loadHomeSection("dashboard", getStudentDashboard, null, user.id),
      loadHomeSection("announcements", () => getAnnouncements(3), [], user.id),
      loadHomeSection("events", getEvents, [], user.id),
      loadHomeSection("opportunities", () => getOpportunities(3), [], user.id),
    ]);
    const upcomingEvents = events.data.filter((event) => isEventUpcoming(event));
    const unavailableSections = [
      ...(dashboard.failed || !dashboard.data ? ["personal overview"] : []),
      ...(announcements.failed ? ["announcements"] : []),
      ...(events.failed ? ["events"] : []),
      ...(opportunities.failed ? ["opportunities"] : []),
    ];
    return <HubShell><HomeDashboard user={user} dashboard={dashboard.data} announcements={announcements.data} events={upcomingEvents} opportunities={opportunities.data} unavailableSections={unavailableSections} /></HubShell>;
  }

  const [text, announcements, clubs, events, opportunities] = await Promise.all([
    loadHomeSection("site-content", getSiteText, siteTextDefaults),
    loadHomeSection("announcements", () => getAnnouncements(1), []),
    loadHomeSection("clubs", () => getAllClubs(3), []),
    loadHomeSection("events", getEvents, []),
    loadHomeSection("opportunities", () => getOpportunities(3), []),
  ]);
  const [featured] = announcements.data;
  const upcomingEvents = events.data.filter((event) => isEventUpcoming(event));
  return (
    <HubShell>
      <div className="min-h-full bg-transparent">

      <section className="relative overflow-hidden bg-transparent">
        <div className="hero-blobs pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute left-[8%] top-[18%] h-[300px] w-[520px]"
            style={{ background: "#4772AA" }}
          />
          <div
            className="absolute left-[38%] top-[42%] h-[350px] w-[386px] rounded-full"
            style={{ background: "#589AEF" }}
          />
          <div
            className="absolute left-[14%] top-[52%] h-[294px] w-[294px]"
            style={{ background: "#FF8E68" }}
          />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col items-start px-6 pb-24 pt-20 sm:pt-28">
          <p className="font-display text-3xl font-bold tracking-wide text-cream sm:text-5xl lg:text-[61px] lg:leading-[75px]">
            Welcome to Hatchx
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-[1.05] tracking-wide text-cream sm:text-7xl lg:text-[96px] xl:text-[105px] xl:leading-[131px]">
            {text.data.home_title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg font-semibold leading-8 text-cream lg:text-2xl lg:leading-[30px]">
            {text.data.home_intro}
          </p>
          <div className="mt-10">
            <PrimaryButton
              href="/clubs"
              className="h-16 px-14 text-lg"
            >
              {text.data.home_cta_label}
            </PrimaryButton>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <section className="mt-2">
          <SectionHeader
            title="Announcements"
            subtitle="Browse daily announcements and check for new updates!"
            href="/announcements"
            linkLabel="VIEW ALL"
          />
          {featured ? (
            <AnnouncementCard a={featured} />
          ) : (
            <p className="rounded-card border border-dashed border-line bg-card/60 px-6 py-10 text-center text-sm text-muted">
              No current announcements. Check back soon for school updates.
            </p>
          )}
        </section>

        <section className="mt-10">
          <SectionHeader title="Opportunities" subtitle="Deadlines, programs, service, and student offers." href="/opportunities" linkLabel="VIEW ALL" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.data.slice(0, 3).map((opportunity) => (
              <article key={opportunity.id} className="card-gradient rounded-[10px] p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-orange">{opportunity.type}</p>
                <h3 className="mt-2 font-display text-lg font-bold uppercase text-cream">{opportunity.title}</h3>
                <p className="mt-2 text-sm text-cream/70">{opportunity.date}</p>
                <PrimaryButton href={`/opportunities/${opportunity.id}`} className="mt-4">Learn more</PrimaryButton>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeader
            title="Clubs"
            subtitle="Explore student organizations, find your community, and get involved."
            href="/clubs"
            linkLabel="VIEW ALL"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clubs.data.slice(0, 3).map((club) => (
              <ClubCard key={club.slug} club={club} />
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeader
            title="Events"
            subtitle="Bayside hosts fun, engaging events for students to enjoy. Check out the date, time, location, and price."
            href="/calendar"
            linkLabel="VIEW ALL"
          />
          {upcomingEvents.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.slice(0, 3).map((event) => (
              <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-line bg-card/60 px-6 py-10 text-center text-sm text-muted">
              No upcoming events have been published yet.
            </p>
          )}
        </section>

        <section className="mt-10">
          <SectionHeader
            title="Spirit Week"
            subtitle="Spirit Week is a time to show off our SCHOOL SPIRIT! Each day of the week is filled with something different."
            href="/spirit-week"
            linkLabel="VIEW ALL"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {spiritDays.map((d) => (
              <div
                key={d.day}
                className={`flex flex-col justify-between rounded-card p-5 shadow-sm ${d.color}`}
              >
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                  {d.day}
                </span>
                <span className="mt-3 font-display text-base font-bold leading-snug">
                  {d.name}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
      </div>
    </HubShell>
  );
}

const spiritDays = [
  { day: "Monday", name: "Pajama Day", color: "bg-navy text-cream" },
  { day: "Tuesday", name: "Twin Day", color: "bg-peach text-black" },
  { day: "Wednesday", name: "Dress Like a Teacher Day", color: "bg-orange text-black" },
  { day: "Thursday", name: "Class Color Day", color: "bg-cream text-navy" },
  { day: "Friday", name: "Blue & Gold Day", color: "bg-navy text-cream" },
];
