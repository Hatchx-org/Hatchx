import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { clubs as staticClubs, slugify, type Club } from "./data";
import type {
  ApprovedClubRow,
  ClubAdvisorRow,
  ClubLinkRow,
  ClubAnnouncementRow,
  ClubMediaRow,
  ClubMeetingRow,
  ClubOfficerRow,
  ClubRow,
} from "@/lib/supabase/types";
import { developmentFallback } from "./live-data";
import { bellPeriodFromStartTime } from "./bell-schedule";

const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shortTime(value: string | null) {
  if (!value) return "";
  const [hoursText, minutes = "00"] = value.split(":");
  const hours = Number(hoursText);
  if (!Number.isFinite(hours)) return value;
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${minutes} ${period}`;
}

function mapDatabaseClub(
  row: ClubRow,
  meetings: ClubMeetingRow[],
  officers: ClubOfficerRow[],
  advisors: ClubAdvisorRow[],
  announcements: ClubAnnouncementRow[],
  media: ClubMediaRow[],
  links: ClubLinkRow[],
): Club {
  // Every data source is normalized to one small public view model so pages do
  // not depend directly on database/legacy column shapes.
  const firstMeeting = meetings[0];
  const start = shortTime(firstMeeting?.start_time ?? null);
  const end = shortTime(firstMeeting?.end_time ?? null);
  const bellPeriod = bellPeriodFromStartTime(firstMeeting?.start_time);
  const cover = media.find((item) => item.is_cover);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.interest_tags[0] ?? (row.is_stem ? "STEM" : row.is_community_service ? "Community Service" : "Other"),
    tags: row.interest_tags.slice(0, 3),
    description: row.short_description,
    fullDescription: row.full_description ?? row.short_description,
    mission: row.mission ?? undefined,
    activities: row.activities ?? undefined,
    whoShouldJoin: row.who_should_join ?? undefined,
    membershipExpectations: row.membership_expectations ?? undefined,
    meetingDays: [...new Set(meetings.map((meeting) => dayNames[meeting.day_of_week]).filter(Boolean))],
    meetingDate: firstMeeting?.recurrence_note ?? (meetings.length ? "Weekly" : "Schedule TBA"),
    meetingTime: bellPeriod ? `Period ${bellPeriod.period}` : start ? `${start}${end ? ` – ${end}` : ""}` : "TBA",
    location: firstMeeting?.location ?? "TBA",
    commitment: Number(row.weekly_commitment_hours ?? 0),
    communityService: row.is_community_service,
    stem: row.is_stem,
    officers: officers.map((officer) => ({ role: officer.title, name: officer.display_name ?? "Officer", avatarUrl: officer.avatar_path ?? undefined })),
    advisors: advisors.map((advisor) => ({
      name: advisor.display_name ?? "Club Advisor",
      email: advisor.contact_email ?? undefined,
    })),
    activeStartDate: row.active_start_date ?? undefined,
    activeEndDate: row.active_end_date ?? undefined,
    googleClassroomCode: row.google_classroom_code ?? undefined,
    links: links.map((link) => ({ id: link.id, platform: link.platform, label: link.label, value: link.value })),
    contactEmail: row.contact_email ?? undefined,
    joinPolicy: row.join_policy,
    recruitingStatus: row.recruiting_status,
    announcements: announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      date: announcement.created_at,
      image: media.find((item) => item.id === announcement.media_id)?.medium_path ?? media.find((item) => item.id === announcement.media_id)?.storage_path,
      imageAlt: media.find((item) => item.id === announcement.media_id)?.alt_text ?? undefined,
    })),
    media: media.filter((item) => item.visibility !== "private").map((item) => ({
      id: item.id,
      type: item.media_type,
      path: item.medium_path ?? item.storage_path,
      title: item.title ?? undefined,
      alt: item.alt_text ?? undefined,
    })),
    logo: cover?.storage_path,
    profileBackgroundColor: row.profile_background_color,
    profileAccentColor: row.profile_accent_color,
  };
}

export function mapApprovedClub(row: ApprovedClubRow): Club {
  return {
    slug: `${slugify(row.club_name)}-${row.id.slice(0, 8)}`,
    name: row.club_name,
    category: row.category,
    tags: [row.category],
    description: row.description,
    meetingDays: row.meeting_days
      ? row.meeting_days.split(/\s*,\s*/).filter(Boolean)
      : [],
    meetingDate: "See meeting days",
    meetingTime: "TBA",
    location: "TBA",
    commitment: 0,
    communityService: row.category === "Community Service",
    stem: row.category === "STEM",
    officers: [],
  };
}

/**
 * All public clubs: the static directory plus club applications that an
 * administrator approved — approved charters go live automatically.
 */
export const getAllClubs = cache(async (limit?: number): Promise<Club[]> => {
  if (!isSupabaseConfigured()) {
    const demoClubs = developmentFallback(staticClubs);
    return limit === undefined ? demoClubs : demoClubs.slice(0, limit);
  }

  const supabase = await createServerClient();
  let canonicalQuery = supabase
    .from("clubs")
    .select("*")
    .eq("status", "published")
    .order("name");
  if (limit !== undefined) canonicalQuery = canonicalQuery.limit(limit);
  const { data: canonicalRows, error: canonicalError } = await canonicalQuery;

  if (canonicalError) {
  throw new Error(`Unable to load clubs: ${canonicalError.message}`);
  }
  
  if (!canonicalRows?.length) {
    return [];
  }

  if (!canonicalError && canonicalRows?.length) {
    // Fetch relations in parallel to avoid one database round trip per club.
    const ids = canonicalRows.map((row) => row.id);
    const [meetingResult, officerResult, advisorResult, announcementResult, mediaResult, linkResult] = await Promise.all([
      supabase.from("club_meetings").select("*").in("club_id", ids).order("day_of_week"),
      supabase.from("club_officers").select("*").in("club_id", ids).order("sort_order").order("created_at"),
      supabase.from("club_advisors").select("*").in("club_id", ids),
      supabase.from("club_announcements").select("*").in("club_id", ids).eq("published", true).order("created_at", { ascending: false }),
      supabase.from("club_media").select("*").in("club_id", ids).order("created_at", { ascending: false }),
      supabase.from("club_links").select("*").in("club_id", ids).order("sort_order"),
    ]);
    const canonical = canonicalRows.map((row) => mapDatabaseClub(
      row,
      (meetingResult.data ?? []).filter((item) => item.club_id === row.id),
      (officerResult.data ?? []).filter((item) => item.club_id === row.id).map((item) => ({
        ...item,
        avatar_path: item.avatar_path ? supabase.storage.from("board-avatars").getPublicUrl(item.avatar_path).data.publicUrl : null,
      })),
      (advisorResult.data ?? []).filter((item) => item.club_id === row.id),
      (announcementResult.data ?? []).filter((item) => item.club_id === row.id),
      (mediaResult.data ?? [])
        .filter((item) => item.club_id === row.id)
        .map((item) => ({
          ...item,
          storage_path: supabase.storage.from("club-media").getPublicUrl(item.storage_path).data.publicUrl,
          medium_path: item.medium_path ? supabase.storage.from("club-media").getPublicUrl(item.medium_path).data.publicUrl : null,
          thumbnail_path: item.thumbnail_path ? supabase.storage.from("club-media").getPublicUrl(item.thumbnail_path).data.publicUrl : null,
        })),
      (linkResult.data ?? []).filter((item) => item.club_id === row.id),
    ));
    return canonical;
  }

  // Keep legacy approved applications readable while older deployments migrate.
  const { data: rows, error } = await supabase
    .from("approved_clubs")
    .select("id, club_name, category, description, meeting_days, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Unable to load clubs: ${error.message}`);

  const approved: Club[] = (rows ?? []).map(mapApprovedClub);

  return limit === undefined ? approved : approved.slice(0, limit);
});

/** Look up a single club by slug across static + approved applications. */
export async function getClubBySlug(slug: string): Promise<Club | null> {
  const all = await getAllClubs();
  const legacyNameSlug = slug.replace(/-[0-9a-f]{8}$/i, "");
  return (
    all.find((club) => club.slug === slug) ??
    all.find((club) => slugify(club.name) === slug) ??
    (legacyNameSlug !== slug
      ? all.find((club) => slugify(club.name) === legacyNameSlug)
      : undefined) ??
    null
  );
}
