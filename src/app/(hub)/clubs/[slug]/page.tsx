import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { PrimaryButton } from "@/components/cards";
import { getClubBySlug } from "@/lib/clubs";
import { getCurrentUser } from "@/lib/auth";
import {
  getClubInterestInfo,
  getClubCommunication,
  getClubMembershipInfo,
  leaveClub,
  requestClubMembership,
  toggleClubInterest,
} from "../actions";
import PendingSubmitButton from "@/components/pending-submit-button";
import type { Metadata } from "next";
import ClubChat from "./club-chat";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/data";
import { defaultClubAppearance, foregroundForGradient } from "@/lib/club-appearance";

// Membership controls and private chat depend on the request's auth cookies.
// Never reuse a build-time guest version of a Club page for signed-in users.
export const dynamic = "force-dynamic";

function clubLinkHref(platform: string, value: string) {
  if (platform === "google_classroom" && !/^https?:\/\//i.test(value)) {
    return `https://classroom.google.com/?emr=0&authuser=0#join-code=${encodeURIComponent(value)}`;
  }
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  return club ? { title: club.name, description: club.description } : { title: "Club not found" };
}

export default async function ClubDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ updatesPage?: string }>;
}) {
  const { slug } = await params;
  const { updatesPage: rawUpdatesPage } = await searchParams;
  const club = await getClubBySlug(slug);
  if (!club) notFound();
  const canonicalSlug = slugify(club.name);
  const canonicalClub = slug === canonicalSlug ? club : await getClubBySlug(canonicalSlug);
  if (slug !== canonicalSlug && club.id && canonicalClub?.id === club.id) {
    permanentRedirect(`/clubs/${canonicalSlug}${rawUpdatesPage ? `?updatesPage=${encodeURIComponent(rawUpdatesPage)}` : ""}`);
  }
  const advisors = club.advisors ?? [];
  const user = await getCurrentUser();
  const isApprovedCharter = club.officers.length === 0;
  const interest = await getClubInterestInfo(club.slug);
  const membership = await getClubMembershipInfo(club.id);
  const communication = await getClubCommunication(club.id);
  const constitution = club.id && isSupabaseConfigured()
    ? (await (await createServerClient()).from("club_constitution_versions").select("version_number,body,change_summary,adopted_on").eq("club_id", club.id).order("version_number", { ascending: false }).limit(1).maybeSingle()).data
    : null;
  const announcements = club.announcements ?? [];
  const announcementsPerPage = 5;
  const announcementPageCount = Math.max(1, Math.ceil(announcements.length / announcementsPerPage));
  const requestedAnnouncementPage = Number.parseInt(rawUpdatesPage ?? "1", 10);
  const announcementPage = Math.min(Math.max(Number.isFinite(requestedAnnouncementPage) ? requestedAnnouncementPage : 1, 1), announcementPageCount);
  const visibleAnnouncements = announcements.slice((announcementPage - 1) * announcementsPerPage, announcementPage * announcementsPerPage);
  const commitmentLabel = club.commitment > 0
    ? `About ${club.commitment} hour${club.commitment === 1 ? "" : "s"}/week`
    : "Flexible commitment";
  const profileBackground = club.profileBackgroundColor ?? defaultClubAppearance.background;
  const profileAccent = club.profileAccentColor ?? defaultClubAppearance.accent;
  const profileForeground = foregroundForGradient(profileBackground, profileAccent);

  return (
    <div className="club-detail-backdrop mx-auto min-h-full w-full max-w-[1920px] px-5 py-8 text-cream sm:px-8 lg:px-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-[#dcd0be]/70">
        <Link href="/clubs" className="font-medium text-powder hover:text-cream">
          Activities &amp; Clubs
        </Link>
        <span aria-hidden className="mx-2">/</span>
        <span className="text-ink">{club.name}</span>
      </nav>

      <section className="grid min-h-[360px] gap-8 overflow-hidden rounded-[22px] border p-6 lg:grid-cols-[210px_minmax(0,1fr)_280px] lg:items-center lg:p-10" style={{ background: `linear-gradient(135deg, ${profileBackground}, ${profileAccent})`, borderColor: profileAccent, color: profileForeground }}>
        <div className="relative mx-auto flex size-[170px] flex-col items-center justify-center overflow-hidden rounded-full border border-[#2a2829] bg-[#97b4de]">{club.logo ? <Image src={club.logo} alt={`${club.name} cover`} fill sizes="170px" className="object-cover" /> : <><span className="text-6xl font-bold text-[#263a99]">{club.name[0]}</span><span className="mt-2 text-[10px] font-bold uppercase">{club.name}</span></>}</div>
        <div>
          <p className="text-sm">{club.category} · {club.meetingDate}</p>
          <h1 className="mt-2 font-display text-5xl font-bold uppercase leading-none sm:text-6xl">{club.name}</h1>
          <p className="mt-4 max-w-4xl text-sm font-medium leading-6">{club.description}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-3 py-1.5 font-bold uppercase ${club.recruitingStatus === "closed" ? "bg-[#2a2829] text-white" : club.recruitingStatus === "paused" ? "bg-[#f78660] text-black" : "bg-[#d8f3df] text-[#176b35]"}`}>{club.recruitingStatus ?? "Recruiting"}</span>
          <span className="rounded-full border border-[#2a2829] px-3 py-1.5">{club.meetingDays.join(", ")}</span>
          <span className="rounded-full border border-[#2a2829] px-3 py-1.5">{club.meetingTime}</span>
          <span className="rounded-full border border-[#2a2829] px-3 py-1.5">{club.location}</span>
          {club.communityService && (
            <span className="rounded-full bg-[#f78660] px-3 py-1.5 font-semibold text-black">
              Community Service
            </span>
          )}
          {(club.tags ?? [club.category]).map((tag) => <span key={tag} className="rounded-full border border-[#263a99]/30 bg-[#97b4de]/20 px-3 py-1.5 font-semibold text-[#263a99]">#{tag}</span>)}
          </div>
        </div>
        <div>
          {user ? (
            <PrimaryButton href="/calendar" className="w-full bg-[#97b4de]">Meeting dates →</PrimaryButton>
          ) : (
            <PrimaryButton href={`/login?next=${encodeURIComponent(`/clubs/${canonicalSlug}`)}`} className="w-full bg-[#97b4de]">Sign in to Join</PrimaryButton>
          )}
          {membership.available && user && club.id && (["active", "pending"].includes(membership.status ?? "") || (club.recruitingStatus ?? "recruiting") === "recruiting") && (
            <form action={membership.status === "active" || membership.status === "pending" ? leaveClub : requestClubMembership} className="mt-3">
              <input type="hidden" name="club_id" value={club.id} />
              <input type="hidden" name="slug" value={club.slug} />
              <PendingSubmitButton
                pendingLabel="Saving…"
                className="inline-flex h-10 w-full items-center justify-center rounded-[22px] bg-[#f78660] px-6 text-sm font-semibold text-black hover:bg-[#ff9b78]"
              >
                {membership.status === "active"
                  ? "Leave club"
                  : membership.status === "pending"
                    ? "Cancel join request"
                    : club.joinPolicy === "instant"
                      ? "Join club"
                      : "Request to join"}
              </PendingSubmitButton>
            </form>
          )}
          {user && membership.status === "rejected" && membership.rejectionReason ? <div className="mt-3 rounded-control bg-[#f78660]/20 px-4 py-3 text-xs text-[#2a2829]"><p className="font-bold">Membership request declined</p><p className="mt-1">{membership.rejectionReason}</p>{membership.memberReply ? <p className="mt-2 border-t border-black/10 pt-2"><strong>Your reply:</strong> {membership.memberReply}</p> : <Link href="/profile#clubs" className="mt-2 inline-block font-bold underline">Reply from My Hub →</Link>}</div> : null}
          {user && !["active", "pending"].includes(membership.status ?? "") && (club.recruitingStatus ?? "recruiting") !== "recruiting" ? <p className="mt-3 rounded-control bg-black/10 px-4 py-3 text-xs font-medium text-[#2a2829]">Membership is currently {club.recruitingStatus}. You can still review meetings and contact the Club.</p> : null}
          {interest.available && user && (
            <form action={toggleClubInterest} className="mt-3">
              <input type="hidden" name="slug" value={club.slug} />
              <PendingSubmitButton
                pendingLabel="Saving…"
                  className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-[22px] border border-[#2a2829] bg-white px-6 text-sm font-semibold ${
                  interest.joined
                    ? "text-[#263a99]"
                    : "text-[#2a2829]"
                }`}
              >
                {interest.joined ? "★ Interested" : "☆ I'm interested"}
                <span className="text-xs text-muted">({interest.count})</span>
              </PendingSubmitButton>
            </form>
          )}
          {user && membership.status === "active" ? (
            <div role="status" className="mt-3 rounded-control bg-[#97b4de]/25 px-4 py-3 text-xs font-medium text-[#263a99]">
              <p>You&apos;ve joined this club. Meeting details are below and the club now appears in your profile.</p>
              <Link href="/clubs/check-in" className="mt-2 inline-block font-bold underline underline-offset-2">Quick activity check-in →</Link>
            </div>
          ) : user && membership.status === "pending" ? (
            <p role="status" className="mt-3 rounded-control bg-[#f78660]/20 px-4 py-3 text-xs font-medium text-[#2a2829]">
              Your join request is waiting for club approval. You can track it from your profile.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-[#2a2829]/70">
            {user
              ? club.joinPolicy === "instant"
                ? "Open membership · joining is instant. You can also drop by a meeting first."
                : "Membership requires club approval. You can still drop by a meeting first."
              : `${club.joinPolicy === "instant" ? "Open membership · join instantly" : "Approval required"}. Sign in with your NYC student account to continue.`}
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-[20px] bg-[#f0ebe5]/95 p-6 text-[#2a2829] lg:p-10" aria-labelledby="club-about-title">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#263a99]">Discover the Club</p>
        <h2 id="club-about-title" className="mt-2 font-display text-3xl font-bold uppercase sm:text-4xl">About {club.name}</h2>
        <p className="mt-5 max-w-4xl whitespace-pre-wrap text-base leading-8 text-[#2a2829]/80">{club.fullDescription ?? club.description}</p>
        {[club.mission, club.activities, club.whoShouldJoin, club.membershipExpectations].some(Boolean) ? <div className="mt-8 grid gap-4 md:grid-cols-2">
          {club.mission ? <ProfileSection title="Our mission" body={club.mission} /> : null}
          {club.activities ? <ProfileSection title="What we do" body={club.activities} /> : null}
          {club.whoShouldJoin ? <ProfileSection title="Who should join" body={club.whoShouldJoin} /> : null}
          {club.membershipExpectations ? <ProfileSection title="What members can expect" body={club.membershipExpectations} /> : null}
        </div> : null}
      </section>

      {(club.links?.length || club.googleClassroomCode) && (
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {club.links?.length ? (
            <div className="card-gradient rounded-[10px] p-5 sm:col-span-3">
              <h2 className="font-display text-lg font-bold uppercase text-cream">Club links</h2>
              <div className="mt-3 flex flex-wrap gap-2">{club.links.map((item) => {
                const href = clubLinkHref(item.platform, item.value);
                return href
                  ? <a key={item.id} href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-powder hover:text-cream">{item.label} ↗</a>
                  : <span key={item.id} className="rounded-full border border-line px-4 py-2 text-sm text-cream/75">{item.label}: {item.value}</span>;
              })}</div>
            </div>
          ) : club.googleClassroomCode ? (
            <div className="card-gradient rounded-[10px] p-5">
              <h2 className="font-display text-lg font-bold uppercase text-cream">Google Classroom</h2>
              <p className="mt-2 font-mono text-sm text-cream/75">{club.googleClassroomCode}</p>
            </div>
          ) : null}
        </section>
      )}

      {constitution ? <section className="card-gradient mt-8 rounded-[14px] border border-white/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Governance</p><h2 className="mt-1 font-display text-2xl font-bold uppercase text-cream">Club constitution</h2></div><span className="rounded-full border border-line px-3 py-1 text-xs text-cream/70">Version {constitution.version_number}</span></div>
        <p className="mt-2 text-sm text-cream/60">{constitution.change_summary}{constitution.adopted_on ? ` · Adopted ${constitution.adopted_on}` : ""}</p>
        <details className="mt-4"><summary className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold text-powder">Read full constitution</summary><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-cream/75">{constitution.body}</p></details>
      </section> : null}

      <section className="mt-12" aria-labelledby="club-stream-title">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-powder">Class stream</p>
        <h2 id="club-stream-title" className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide text-cream">Club announcements</h2>
        <p className="mt-2 max-w-2xl text-sm text-cream/60">Official updates from the Club board and Advisor.</p>
        {announcements.length ? (
          <div className="mt-5 space-y-4">
            {visibleAnnouncements.map((announcement) => (
              <article key={announcement.id} className="card-gradient rounded-[14px] border border-white/10 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-bold uppercase text-cream">{announcement.title}</h3>
                  <time dateTime={announcement.date} className="text-xs text-cream/45">
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(announcement.date))}
                  </time>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-cream/75">{announcement.body}</p>
                {announcement.image ? <Image src={announcement.image} alt={announcement.imageAlt ?? ""} width={960} height={540} sizes="(max-width: 1024px) 100vw, 70vw" className="mt-4 aspect-video w-full rounded-[10px] object-cover" /> : null}
              </article>
            ))}
            {announcementPageCount > 1 ? (
              <nav aria-label="Club announcement pages" className="flex items-center justify-between gap-3 pt-2">
                {announcementPage > 1 ? <Link href={`/clubs/${canonicalSlug}?updatesPage=${announcementPage - 1}#club-stream-title`} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-cream hover:bg-white/5">← Newer</Link> : <span />}
                <span className="text-xs font-semibold text-cream/55">Page {announcementPage} of {announcementPageCount}</span>
                {announcementPage < announcementPageCount ? <Link href={`/clubs/${canonicalSlug}?updatesPage=${announcementPage + 1}#club-stream-title`} className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-cream hover:bg-white/5">Older →</Link> : <span />}
              </nav>
            ) : null}
          </div>
        ) : (
          <p className="mt-5 rounded-[14px] border border-dashed border-white/15 px-5 py-8 text-center text-sm text-cream/50">No Club announcements yet.</p>
        )}
      </section>

      {communication.available && club.id ? (
        <ClubChat
          clubId={club.id}
          slug={club.slug}
          messages={communication.messages}
          currentUser={{ id: user!.id, name: user!.name, avatarUrl: user!.avatarUrl }}
          moderationReady={communication.moderationReady}
          agreed={communication.agreed}
          restricted={communication.restricted}
          restrictionReason={communication.restrictionReason}
          canModerate={communication.canModerate}
          moderationMembers={communication.moderationMembers}
        />
      ) : user && club.id ? (
        <section className="mt-12 rounded-[18px] border border-dashed border-white/15 p-6 text-center">
          <h2 className="font-display text-xl font-semibold uppercase text-cream">Member chat</h2>
          <p className="mt-2 text-sm text-cream/55">Join this Club and receive approval to access its private conversation.</p>
        </section>
      ) : null}

      {club.media?.some((item) => item.type === "image") ? (
        <section className="mt-12" aria-labelledby="club-gallery-title">
          <h2 id="club-gallery-title" className="font-display text-3xl font-semibold uppercase tracking-wide text-cream">Photo gallery</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {club.media.filter((item) => item.type === "image").map((item) => (
              <figure key={item.id} className="overflow-hidden rounded-[10px] border border-line bg-card">
                <Image
                  src={item.path}
                  alt={item.alt ?? ""}
                  width={640}
                  height={480}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="aspect-[4/3] w-full object-cover"
                />
                {item.title ? <figcaption className="px-4 py-3 text-sm font-semibold text-ink">{item.title}</figcaption> : null}
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card-gradient rounded-[10px] p-6">
          <h2 className="font-display text-xl font-bold uppercase text-cream">Meeting Details</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-cream">Date:</dt>
              <dd className="text-cream/75">{club.meetingDate}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-cream">Time:</dt>
              <dd className="text-cream/75">{club.meetingTime}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-cream">Location:</dt>
              <dd className="text-cream/75">{club.location}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 font-semibold text-cream">Description:</dt>
              <dd className="leading-6 text-cream/75">{club.description}</dd>
            </div>
          </dl>
        </div>

        <aside className="card-gradient rounded-[10px] p-6">
          <h2 className="font-display text-xl font-bold uppercase text-cream">About</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-cream/75">{club.whoShouldJoin ?? `${club.name} welcomes interested students. Visit a meeting or contact the Club to learn whether it is a good fit.`}</p>
          <ul className="mt-4 space-y-2 text-sm text-cream/75">
            <li>• {commitmentLabel}</li>
            <li>• {club.recruitingStatus === "recruiting" ? "Currently welcoming new members" : club.recruitingStatus === "paused" ? "Membership requests are temporarily paused" : "Membership is currently closed"}</li>
          </ul>
          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Advisor{advisors.length === 1 ? "" : "s"}</h3>
            {advisors.length ? <ul className="mt-3 space-y-3">{advisors.map((advisor) => <li key={`${advisor.name}-${advisor.email ?? ""}`} className="text-sm text-cream/75"><strong className="block text-cream">{advisor.name}</strong>{advisor.email ? <a href={`mailto:${advisor.email}`} className="mt-0.5 block break-all text-powder hover:text-cream">{advisor.email}</a> : <span className="mt-0.5 block text-cream/55">Email not listed</span>}</li>)}</ul> : <p className="mt-2 text-sm text-cream/55">Advisor information will be posted soon.</p>}
          </div>
        </aside>
      </section>

      <section className="mt-10 overflow-hidden rounded-[20px] bg-[#f0ebe5]/95 p-6 text-[#2a2829] lg:p-10">
        <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#263a99]">Club leadership</p><h2 className="mt-2 font-display text-3xl font-semibold uppercase tracking-wide text-[#2a2829] sm:text-5xl">
          Meet the board!
        </h2>
        </div>
        {isApprovedCharter ? (
          <p className="mt-5 text-center text-sm text-[#2a2829]/70">
            This club was just chartered — the officer roster will be posted soon.
            Come to a meeting to meet the founding board!
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">Our officers for the 2025–2026 school year.</p>
            <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {club.officers.map((o) => (
                <div
                  key={`${o.role}-${o.name}`}
                  className="relative flex min-h-[285px] flex-col items-center overflow-hidden rounded-[18px] border border-[#2a2829] bg-white p-5 text-center"
                >
                  <span className="rounded-full bg-[#263a99] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#f0ebe5]">{o.role}</span>
                  <p className="mt-4 font-display text-sm font-bold uppercase tracking-wide text-[#2a2829]">{o.name}</p>
                  <div className="absolute -bottom-20 flex size-[210px] items-start justify-center overflow-hidden rounded-full bg-[#dcd0be] pt-12 shadow-[0_4px_30px_-8px_rgba(252,241,221,0.7)]">
                    {o.avatarUrl ? <Image src={o.avatarUrl} alt={`${o.name}, ${o.role}`} fill sizes="210px" className="object-cover object-center" /> : <span className="font-display text-xl font-extrabold text-[#263a99]">{o.name.split(" ").map((w) => w[0]).join("")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      <footer className="mt-12 flex items-center gap-5 pb-2 text-[10px] font-medium text-[#f0ebe5]"><span>CLUB PROFILE</span><span className="h-px flex-1 bg-[#f0ebe5]" /><span className="text-[#dcd0be]">{club.name.toUpperCase()}</span></footer>
    </div>
  );
}

function ProfileSection({ title, body }: { title: string; body: string }) {
  return <article className="rounded-[14px] border border-[#2a2829]/10 bg-white/65 p-5"><h3 className="font-display text-lg font-bold uppercase text-[#263a99]">{title}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#2a2829]/75">{body}</p></article>;
}
