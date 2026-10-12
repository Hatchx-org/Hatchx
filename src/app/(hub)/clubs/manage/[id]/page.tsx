import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { AttendanceIcon, CalendarIcon, GearIcon, MediaIcon, MegaphoneIcon, UserIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { bellPeriodFromStartTime, bellPeriods } from "@/lib/bell-schedule";
import { addClubLink, addClubMeeting, publishClubAnnouncement, removeClubLink, reviewClubMembership, updateManagedClub } from "../actions";
import ClubGovernancePanel from "./club-governance-panel";
import FairQrPanel from "./fair-qr-panel";
import InviteCodePanel from "./invite-code-panel";
import StudentInvitationPanel from "./student-invitation-panel";
import ClubAppearanceForm from "./club-appearance-form";
import { defaultClubAppearance } from "@/lib/club-appearance";

const input = "h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-powder focus:ring-2 focus:ring-powder/20";
const MEMBER_PAGE_SIZE = 25;

export default async function ManageClubPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ memberPage?: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  const { memberPage: memberPageValue } = await searchParams;
  const memberPage = Math.max(1, Math.min(1000, Number.parseInt(memberPageValue ?? "1", 10) || 1));
  const memberFrom = (memberPage - 1) * MEMBER_PAGE_SIZE;
  if (!user) redirect(`/login?next=/clubs/manage/${id}`);
  if (!isSupabaseConfigured()) redirect("/clubs");

  const supabase = await createServerClient();
  const [governAccess, manageAccess] = await Promise.all([
    supabase.rpc("can_govern_club", { p_club_id: id }),
    supabase.rpc("can_manage_club", { p_club_id: id }),
  ]);
  const isStaff = ["staff", "admin"].includes(user.role);
  const canGovern = isStaff || governAccess.data === true;
  if (!isStaff && !manageAccess.data) redirect("/clubs/manage");

  const [
    { data: club },
    { data: meetings },
    { data: memberships },
    activeMemberResult,
    { data: officers },
    { data: advisors },
    { data: media },
    { data: history },
    { data: clubLinks },
    activeMembers,
    postCount,
    recentPosts,
    openAttendance,
  ] = await Promise.all([
    supabase.from("clubs").select("*").eq("id", id).maybeSingle(),
    supabase.from("club_meetings").select("*").eq("club_id", id).order("day_of_week"),
    supabase.from("club_memberships").select("id, profile_id, status, requested_at").eq("club_id", id).eq("status", "pending").order("requested_at"),
    supabase.from("club_memberships").select("id, profile_id, status, requested_at", { count: "exact" }).eq("club_id", id).eq("status", "active").order("requested_at").range(memberFrom, memberFrom + MEMBER_PAGE_SIZE - 1),
    supabase.from("club_officers").select("*").eq("club_id", id).order("title"),
    supabase.from("club_advisors").select("*").eq("club_id", id),
    supabase.from("club_media").select("*").eq("club_id", id).eq("media_type", "image").order("created_at", { ascending: false }),
    supabase.from("club_audit_log").select("*").eq("club_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("club_links").select("*").eq("club_id", id).order("sort_order").order("created_at"),
    supabase.from("club_memberships").select("id", { count: "exact", head: true }).eq("club_id", id).eq("status", "active"),
    supabase.from("club_announcements").select("id", { count: "exact", head: true }).eq("club_id", id),
    supabase.from("club_announcements").select("id,title,body,published,created_at").eq("club_id", id).order("created_at", { ascending: false }).limit(4),
    supabase.from("club_attendance_sessions").select("id", { count: "exact", head: true }).eq("club_id", id).eq("active", true),
  ]);
  if (!club) notFound();

  const members = activeMemberResult.data ?? [];
  const memberTotal = activeMemberResult.count ?? 0;
  const memberPageCount = Math.max(1, Math.ceil(memberTotal / MEMBER_PAGE_SIZE));
  const profileIds = [...(memberships ?? []), ...(members ?? [])].map((membership) => membership.profile_id);
  const { data: profiles } = profileIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", profileIds) : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const statusTone = club.status === "published" ? "bg-[#d8f3df] text-[#176b35]" : club.status === "draft" ? "bg-[#fff0c2] text-[#7b5800]" : "bg-white/15 text-white";

  const workspaceLinks = [
    { href: "#stream", label: "Stream", icon: MegaphoneIcon },
    { href: `/clubs/manage/${id}/content`, label: "Content", icon: CalendarIcon },
    { href: "#members", label: "People", icon: UserIcon },
    { href: "#media", label: "Media", icon: MediaIcon },
    { href: "#attendance", label: "Attendance", icon: AttendanceIcon },
    { href: "#fair-qr", label: "Fair QR", icon: MediaIcon },
    { href: "#invite-codes", label: "Invite codes", icon: UserIcon },
    { href: "#student-invitations", label: "Invite students", icon: UserIcon },
    { href: `/clubs/manage/${id}/finance`, label: "Finance", icon: GearIcon },
    { href: `/clubs/manage/${id}/tables`, label: "Tables", icon: CalendarIcon },
    { href: `/clubs/manage/${id}/operations`, label: "Constitution", icon: CalendarIcon },
    { href: "#settings", label: "Settings", icon: GearIcon },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-6 lg:py-12">
      <Link href="/clubs/manage" className="text-sm font-semibold text-powder hover:text-ink">← All managed clubs</Link>

      <header className="relative mt-4 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#101936] via-[#263a99] to-[#5c78c8] p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-16 -top-20 size-64 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${statusTone}`}>{club.status}</span><span className="text-xs text-white/65">Managed by {user.name}</span></div>
            <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-tight sm:text-6xl">{club.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75 sm:text-base">{club.short_description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/clubs/${club.slug}`} className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/20">View Club page</Link>
            <Link href={`/clubs/manage/${id}/content`} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#263a99]">Manage content</Link>
            <Link href={`/clubs/manage/${id}/finance`} className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/20">Treasury &amp; fundraising</Link>
            <Link href={`/clubs/manage/${id}/tables`} className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/20">Custom tables</Link>
            <Link href={`/clubs/manage/${id}/operations`} className="rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur hover:bg-white/20">Club constitution</Link>
          </div>
        </div>
      </header>

      <nav aria-label="Club workspace" className="sticky top-0 z-20 -mx-5 mt-4 overflow-x-auto border-y border-line bg-content-bg/95 px-5 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="mx-auto flex min-w-max max-w-7xl gap-1 py-2">
          {workspaceLinks.map((item) => <Link key={item.label} href={item.href} className="flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:bg-card hover:text-ink"><item.icon className="size-4" />{item.label}</Link>)}
        </div>
      </nav>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Club overview">
        {[
          ["Active members", activeMembers.count ?? 0],
          ["Pending requests", memberships?.length ?? 0],
          ["Meeting schedules", meetings?.length ?? 0],
          ["Club updates", postCount.count ?? 0],
          ["Open check-ins", openAttendance.count ?? 0],
        ].map(([label, value]) => <article key={String(label)} className="rounded-card border border-line bg-card p-4"><p className="text-2xl font-bold text-ink">{value}</p><p className="mt-1 text-xs font-medium text-muted">{label}</p></article>)}
      </section>

      <div id="stream" className="mt-8 grid scroll-mt-28 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
        <main className="space-y-6">
          <section className="rounded-[20px] border border-line bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Stream</p><h2 className="mt-1 text-2xl font-bold text-ink">Share an update</h2><p className="mt-1 text-sm text-muted">Post to the Club page now, with an optional image from your media library.</p></div><MegaphoneIcon className="mt-1 size-6 text-navy" /></div>
            <ActionFeedbackForm action={publishClubAnnouncement} className="mt-5 grid gap-3">
              <input type="hidden" name="club_id" value={club.id} />
              <input name="title" required minLength={3} maxLength={120} placeholder="Update title" className={input} />
              <textarea name="body" required minLength={3} maxLength={10000} rows={4} placeholder="What would you like members to know?" className={`${input} h-auto py-3`} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-sm font-medium text-ink">Photo<select name="media_id" defaultValue="" className={`${input} mt-1`}><option value="">No photo</option>{(media ?? []).map((item) => <option key={item.id} value={item.id}>{item.title ?? "Club photo"}</option>)}</select></label><button className="h-11 rounded-full bg-navy px-6 font-bold text-cream">Post update</button></div>
            </ActionFeedbackForm>
          </section>

          <section className="rounded-[20px] border border-line bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Recent activity</p><h2 className="mt-1 text-xl font-bold text-ink">Club updates</h2></div><Link href={`/clubs/manage/${id}/content?tab=posts`} className="text-sm font-semibold text-navy">Edit all →</Link></div>
            {recentPosts.data?.length ? <ol className="mt-4 divide-y divide-line">{recentPosts.data.map((post) => <li key={post.id} className="py-4 first:pt-0 last:pb-0"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${post.published ? "bg-[#32a852]" : "bg-steel"}`} /><p className="font-semibold text-ink">{post.title}</p></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{post.body}</p><p className="mt-2 text-xs text-muted">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(post.created_at))} · {post.published ? "Visible" : "Hidden"}</p></li>)}</ol> : <p className="mt-4 rounded-control bg-content-bg p-5 text-sm text-muted">No Club updates yet. Use the form above to publish the first one.</p>}
          </section>

          <section id="meetings" className="scroll-mt-28 rounded-[20px] border border-line bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Classwork</p><h2 className="mt-1 text-2xl font-bold text-ink">Meeting schedule</h2></div><CalendarIcon className="size-6 text-navy" /></div>
            <ActionFeedbackForm action={addClubMeeting} className="mt-5 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="club_id" value={club.id} />
              <label className="text-sm font-medium text-ink">Day<select name="day_of_week" className={`${input} mt-1`}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
              <label className="text-sm font-medium text-ink">Location<input name="location" placeholder="Room or location" className={`${input} mt-1`} /></label>
              <label className="text-sm font-medium text-ink sm:col-span-2">Period<select name="period" defaultValue="1" className={`${input} mt-1`}>{bellPeriods.map((period) => <option key={period.period} value={period.period}>Period {period.period} · {period.start}–{period.end}</option>)}</select></label>
              <label className="text-sm font-medium text-ink sm:col-span-2">Recurrence<input name="recurrence_note" placeholder="Every Tuesday, except exam weeks" className={`${input} mt-1`} /></label>
              <button className="h-11 rounded-full bg-navy px-6 font-bold text-cream sm:col-span-2">Add meeting schedule</button>
            </ActionFeedbackForm>
            {meetings?.length ? <div className="mt-5 flex flex-wrap gap-2">{meetings.map((meeting) => { const period = bellPeriodFromStartTime(meeting.start_time); return <span key={meeting.id} className="rounded-full border border-line bg-content-bg px-3 py-1.5 text-xs font-medium text-ink">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][meeting.day_of_week - 1]} · {period ? `Period ${period.period}` : "Period TBD"} · {meeting.location ?? "TBD"}</span>; })}</div> : null}
          </section>

          <ClubGovernancePanel clubId={club.id} clubStatus={club.status} userId={user.id} role={user.role} canGovern={canGovern} officers={officers ?? []} advisors={advisors ?? []} media={media ?? []} history={history ?? []} />
          {canGovern ? <div className="mt-6"><StudentInvitationPanel clubId={club.id} /></div> : null}
        </main>

        <aside className="space-y-6">
          <InviteCodePanel clubId={club.id} />
          <FairQrPanel clubId={club.id} clubName={club.name} />
          <section id="members" className="scroll-mt-28 rounded-[20px] border border-line bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">People</p><h2 className="mt-1 text-xl font-bold text-ink">Membership requests</h2></div>{memberships?.length ? <span className="rounded-full bg-orange px-2.5 py-1 text-xs font-bold text-black">{memberships.length}</span> : null}</div>
            {canGovern && memberships?.length ? <ul className="mt-4 space-y-3">{memberships.map((membership) => { const profile = profileMap.get(membership.profile_id); return <li key={membership.id} className="rounded-control border border-line p-3"><p className="font-semibold text-ink">{profile?.full_name ?? profile?.email ?? "Student"}</p><p className="mt-0.5 text-xs text-muted">Requested {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(membership.requested_at))}</p><div className="mt-3 grid gap-2"><ActionFeedbackForm action={reviewClubMembership}><input type="hidden" name="club_id" value={club.id} /><input type="hidden" name="membership_id" value={membership.id} /><input type="hidden" name="status" value="active" /><button className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-cream">Approve</button></ActionFeedbackForm><ActionFeedbackForm action={reviewClubMembership} className="grid gap-2"><input type="hidden" name="club_id" value={club.id} /><input type="hidden" name="membership_id" value={membership.id} /><input type="hidden" name="status" value="rejected" /><label className="text-xs font-semibold text-muted">Reason for rejection<input name="rejection_reason" required minLength={3} maxLength={1000} placeholder="Tell the student what they can do next" className={`${input} mt-1`} /></label><button className="justify-self-start rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted">Decline with reason</button></ActionFeedbackForm></div></li>; })}</ul> : <p className="mt-4 text-sm leading-6 text-muted">{canGovern ? "You’re all caught up—there are no pending requests." : "Membership review is available to advisors and staff."}</p>}
            <details className="mt-5 border-t border-line pt-4" open={!memberships?.length}>
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-ink [&::-webkit-details-marker]:hidden"><span>Active member directory</span><span className="rounded-full bg-content-bg px-2.5 py-1 text-xs text-muted">{memberTotal}</span></summary>
              {members.length ? <><ul className="mt-3 divide-y divide-line">{members.map((membership) => { const profile = profileMap.get(membership.profile_id); return <li key={membership.id} className="py-3"><p className="truncate text-sm font-semibold text-ink">{profile?.full_name ?? "Student"}</p><p className="truncate text-xs text-muted">{profile?.email ?? "School account"}</p></li>; })}</ul>{memberPageCount > 1 && <nav aria-label="Member directory pages" className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3"><span className="text-xs text-muted">Page {Math.min(memberPage, memberPageCount)} of {memberPageCount} · {MEMBER_PAGE_SIZE} per page</span><div className="flex gap-2">{memberPage > 1 && <Link href={`/clubs/manage/${id}?memberPage=${memberPage - 1}#members`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted">Previous</Link>}{memberPage < memberPageCount && <Link href={`/clubs/manage/${id}?memberPage=${memberPage + 1}#members`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-navy">Next</Link>}</div></nav>}</> : memberTotal ? <p className="mt-3 text-sm text-muted">This member page is empty. <Link href={`/clubs/manage/${id}?memberPage=1#members`} className="font-semibold text-navy underline">Return to the first page</Link>.</p> : <p className="mt-3 text-sm text-muted">No active members yet.</p>}
            </details>
          </section>

          <section id="settings" className="scroll-mt-28 rounded-[20px] border border-line bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Settings</p><h2 className="mt-1 text-xl font-bold text-ink">Club profile</h2>
            <div className="mt-5 border-b border-line pb-6"><h3 className="font-semibold text-ink">Public profile background</h3><p className="mt-1 text-xs leading-5 text-muted">Choose a theme or create a two-color background. Text contrast adjusts automatically.</p><ClubAppearanceForm clubId={club.id} background={club.profile_background_color ?? defaultClubAppearance.background} accent={club.profile_accent_color ?? defaultClubAppearance.accent} /></div>
            <ActionFeedbackForm action={updateManagedClub} className="mt-4 grid gap-3">
              <input type="hidden" name="club_id" value={club.id} /><input type="hidden" name="slug" value={club.slug} />
              <label className="text-sm font-medium text-ink">Card summary<textarea name="short_description" required minLength={10} maxLength={1000} defaultValue={club.short_description} rows={3} className={`${input} mt-1 h-auto py-2`} /><span className="mt-1 block text-xs font-normal text-muted">A quick introduction shown in search results and Club cards.</span></label>
              <label className="text-sm font-medium text-ink">Full introduction<textarea name="full_description" required minLength={20} maxLength={5000} defaultValue={club.full_description ?? club.short_description} rows={7} className={`${input} mt-1 h-auto py-2`} /></label>
              <label className="text-sm font-medium text-ink">Mission<textarea name="mission" maxLength={1500} defaultValue={club.mission ?? ""} rows={3} placeholder="What change or purpose drives this Club?" className={`${input} mt-1 h-auto py-2`} /></label>
              <label className="text-sm font-medium text-ink">What we do<textarea name="activities" maxLength={3000} defaultValue={club.activities ?? ""} rows={5} placeholder="Projects, competitions, workshops, trips, or recurring activities" className={`${input} mt-1 h-auto py-2`} /></label>
              <label className="text-sm font-medium text-ink">Who should join<textarea name="who_should_join" maxLength={1500} defaultValue={club.who_should_join ?? ""} rows={3} placeholder="Interests, experience level, or grades—avoid unnecessary restrictions" className={`${input} mt-1 h-auto py-2`} /></label>
              <label className="text-sm font-medium text-ink">Member expectations<textarea name="membership_expectations" maxLength={1500} defaultValue={club.membership_expectations ?? ""} rows={3} placeholder="Attendance, projects, dues, or other expectations" className={`${input} mt-1 h-auto py-2`} /></label>
              <label className="text-sm font-medium text-ink">Hours per week<input type="number" name="weekly_commitment_hours" min={0} max={40} step={0.5} required defaultValue={club.weekly_commitment_hours ?? 0} className={`${input} mt-1`} /></label>
              <fieldset><legend className="text-sm font-medium text-ink">Discovery tags <span className="font-normal text-muted">(1–3)</span></legend><p className="mt-1 text-xs text-muted">The first tag is the primary category. Use interests students might search for, such as Robotics, Public Speaking, or Volunteering.</p><div className="mt-2 grid gap-2">{[0, 1, 2].map((index) => <input key={index} name="interest_tags" required={index === 0} minLength={2} maxLength={30} defaultValue={club.interest_tags[index] ?? ""} placeholder={`Tag ${index + 1}${index ? " (optional)" : ""}`} className={input} />)}</div></fieldset>
              <div className="grid gap-2 text-sm text-ink"><label className="flex items-center gap-2"><input type="checkbox" name="is_stem" defaultChecked={club.is_stem} /> STEM</label><label className="flex items-center gap-2"><input type="checkbox" name="is_community_service" defaultChecked={club.is_community_service} /> Community service</label></div>
              <label className="text-sm font-medium text-ink">Contact email<input type="email" name="contact_email" defaultValue={club.contact_email ?? ""} className={`${input} mt-1`} /></label>
              <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-ink">Active from<input type="date" name="active_start_date" defaultValue={club.active_start_date ?? ""} className={`${input} mt-1`} /></label><label className="text-sm font-medium text-ink">Active until<input type="date" name="active_end_date" defaultValue={club.active_end_date ?? ""} className={`${input} mt-1`} /></label></div>
              <label className="text-sm font-medium text-ink">Join policy<select name="join_policy" defaultValue={club.join_policy} className={`${input} mt-1`}><option value="instant">Instant</option><option value="approval_required">Approval required</option></select></label>
              <label className="text-sm font-medium text-ink">Recruiting status<select name="recruiting_status" defaultValue={club.recruiting_status} className={`${input} mt-1`}><option value="recruiting">Recruiting</option><option value="paused">Paused</option><option value="closed">Closed</option></select></label>
              <button className="h-11 rounded-full bg-navy px-5 font-bold text-cream">Save profile</button>
            </ActionFeedbackForm>
          </section>

          <section id="links" className="scroll-mt-28 rounded-[20px] border border-line bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Links</p>
            <h2 className="mt-1 text-xl font-bold text-ink">Club links</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Add Google Classroom, social media, or any useful Club resource. Each link can be removed independently.</p>
            <ActionFeedbackForm action={addClubLink} className="mt-4 grid gap-3">
              <input type="hidden" name="club_id" value={club.id} />
              <label className="text-sm font-medium text-ink">Platform
                <select name="platform" defaultValue="google_classroom" className={`${input} mt-1`}>
                  <option value="google_classroom">Google Classroom</option>
                  <option value="instagram">Instagram</option>
                  <option value="discord">Discord</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="website">Website</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-sm font-medium text-ink">Display name<input name="label" required minLength={1} maxLength={60} placeholder="e.g. Instagram updates" className={`${input} mt-1`} /></label>
              <label className="text-sm font-medium text-ink">Code or URL<input name="value" required maxLength={500} placeholder="Classroom code or https://…" className={`${input} mt-1`} /></label>
              <button className="h-11 rounded-full bg-navy px-5 font-bold text-cream">Add link</button>
            </ActionFeedbackForm>
            {clubLinks?.length ? (
              <ul className="mt-5 space-y-2">
                {clubLinks.map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 rounded-control border border-line bg-content-bg p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{link.label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{link.value}</p>
                    </div>
                    <ActionFeedbackForm action={removeClubLink}>
                      <input type="hidden" name="club_id" value={club.id} />
                      <input type="hidden" name="link_id" value={link.id} />
                      <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink">Remove</button>
                    </ActionFeedbackForm>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-4 rounded-control bg-content-bg p-4 text-sm text-muted">No Club links have been added yet.</p>}
          </section>
        </aside>
      </div>

    </div>
  );
}
