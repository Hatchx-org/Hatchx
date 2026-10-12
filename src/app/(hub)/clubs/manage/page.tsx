import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ArrowRightIcon, CalendarIcon, ClubsIcon, GearIcon, MegaphoneIcon, UserIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { clubCompleteness } from "@/lib/club-completeness";

function countByClub(rows: { club_id: string }[] | null) {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) counts.set(row.club_id, (counts.get(row.club_id) ?? 0) + 1);
  return counts;
}

export default async function ManageClubsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/clubs/manage");
  if (!isSupabaseConfigured()) {
    return <div className="mx-auto max-w-4xl px-6 py-8"><PageHeader title="Manage clubs" subtitle="Apply the core platform migration to enable club management." /></div>;
  }

  const supabase = await createServerClient();
  let clubIds: string[] | null = null;
  if (!["staff", "admin"].includes(user.role)) {
    const { data, error } = await supabase.rpc("get_managed_club_ids", {});
    if (error) return <p role="alert" className="p-8">Club permissions could not be loaded. Please contact Support to verify database setup.</p>;
    clubIds = data ?? [];
  }

  const query = supabase.from("clubs").select("id, slug, name, short_description, interest_tags, contact_email, google_classroom_code, active_start_date, active_end_date, status").order("name");
  const { data: clubs } = clubIds ? (clubIds.length ? await query.in("id", clubIds) : { data: [] }) : await query;

  if (user.role === "student" && !clubs?.length) {
    const shortcuts = [
      { title: "My joined clubs", description: "See the Clubs you belong to and your membership status.", href: "/profile#clubs", icon: ClubsIcon },
      { title: "My activities", description: "Check upcoming meetings, events, and dates in one calendar.", href: "/announcements?view=calendar", icon: CalendarIcon },
      { title: "Quick check-in", description: "Enter an attendance code when you arrive at a Club activity.", href: "/clubs/check-in", icon: UserIcon },
    ];
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 lg:py-12">
        <PageHeader title="My clubs & activities" subtitle="Quick access to the Clubs and activities you participate in." />
        <section className="mt-7 grid gap-4 md:grid-cols-3" aria-label="Student Club and activity shortcuts">
          {shortcuts.map((item) => (
            <Link key={item.href} href={item.href} className="group flex min-h-52 flex-col rounded-[22px] border border-line bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-powder hover:shadow-xl">
              <span className="flex size-12 items-center justify-center rounded-full bg-navy/10 text-navy"><item.icon className="size-6" /></span>
              <h2 className="mt-6 text-xl font-bold text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
              <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-bold text-navy">Open <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" /></span>
            </Link>
          ))}
        </section>
        <p className="mt-6 text-center text-sm text-muted">Looking for something new? <Link href="/clubs" className="font-bold text-navy">Explore all Clubs →</Link></p>
      </div>
    );
  }

  const ids = (clubs ?? []).map((club) => club.id);
  const empty = { data: [] as { club_id: string }[] };
  const [memberships, meetings, posts] = ids.length
    ? await Promise.all([
        supabase.from("club_memberships").select("club_id").in("club_id", ids).eq("status", "pending"),
        supabase.from("club_meetings").select("club_id").in("club_id", ids),
        supabase.from("club_announcements").select("club_id").in("club_id", ids).eq("published", true),
      ])
    : [empty, empty, empty];
  const pendingByClub = countByClub(memberships.data);
  const meetingsByClub = countByClub(meetings.data);
  const postsByClub = countByClub(posts.data);
  const pendingTotal = [...pendingByClub.values()].reduce((sum, count) => sum + count, 0);
  const incompleteTotal = (clubs ?? []).filter((club) => clubCompleteness(club) < 100).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:py-12">
      <PageHeader title="Manage clubs" subtitle="Your workspace for Club content, people, attendance, and settings." />
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Management overview">
        {[
          { label: "Managed clubs", value: clubs?.length ?? 0, icon: ClubsIcon },
          { label: "Pending requests", value: pendingTotal, icon: UserIcon },
          { label: "Active schedules", value: meetings.data?.length ?? 0, icon: CalendarIcon },
          { label: "Profiles to finish", value: incompleteTotal, icon: GearIcon },
        ].map((stat) => (
          <article key={stat.label} className="rounded-card border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{stat.label}</p><p className="mt-2 text-3xl font-bold text-ink">{stat.value}</p></div>
              <span className="flex size-11 items-center justify-center rounded-full bg-navy/10 text-navy"><stat.icon className="size-5" /></span>
            </div>
          </article>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Classes</p><h2 className="mt-1 font-display text-3xl font-bold uppercase text-ink">Your Club workspaces</h2></div>
        <Link href="/clubs" className="text-sm font-semibold text-powder hover:text-ink">View public directory →</Link>
      </div>

      {clubs?.length ? (
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {clubs.map((club, index) => {
            const completeness = clubCompleteness(club);
            const pending = pendingByClub.get(club.id) ?? 0;
            return (
              <article key={club.id} className="group overflow-hidden rounded-[22px] border border-line bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl">
                <div className={`relative min-h-36 p-6 text-cream ${index % 3 === 1 ? "bg-gradient-to-br from-[#263a99] to-[#596fb7]" : index % 3 === 2 ? "bg-gradient-to-br from-[#172039] to-[#4772aa]" : "bg-gradient-to-br from-[#0b1330] to-[#2945a8]"}`}>
                  <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-bold uppercase tracking-wider">{club.status}</span><span className="text-xs font-semibold text-white/75">{completeness}% complete</span></div>
                  <h3 className="mt-5 line-clamp-2 font-display text-2xl font-bold leading-tight">{club.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/75">{club.short_description}</p>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-3 divide-x divide-line text-center">
                    <div><p className="text-xl font-bold text-ink">{pending}</p><p className="text-[11px] text-muted">Pending</p></div>
                    <div><p className="text-xl font-bold text-ink">{meetingsByClub.get(club.id) ?? 0}</p><p className="text-[11px] text-muted">Schedules</p></div>
                    <div><p className="text-xl font-bold text-ink">{postsByClub.get(club.id) ?? 0}</p><p className="text-[11px] text-muted">Updates</p></div>
                  </div>
                  <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-content-bg" aria-label={`Profile ${completeness}% complete`}><div className="h-full rounded-full bg-navy" style={{ width: `${completeness}%` }} /></div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="flex gap-2">
                      <Link href={`/clubs/manage/${club.id}/content`} title="Manage content" className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-content-bg hover:text-ink"><MegaphoneIcon className="size-4" /></Link>
                      <Link href={`/clubs/${club.slug}`} title="View public Club page" className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-content-bg hover:text-ink"><ClubsIcon className="size-4" /></Link>
                    </div>
                    <Link href={`/clubs/manage/${club.id}`} className="inline-flex h-10 items-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-cream">Open workspace <ArrowRightIcon className="size-4" /></Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 rounded-card border border-dashed border-line p-10 text-center text-muted">No clubs are assigned to you.</p>
      )}
    </div>
  );
}
