export type StudentDashboard = {
  activeClubs: { id: string; slug: string; name: string }[];
  pendingMemberships: number;
  pendingApplications: number;
  openSupportRequests: number;
  managedClubCount: number;
  unreadNotifications: number;
  nextMeeting: { clubId: string; clubSlug: string; clubName: string; location: string | null; startsAt: string } | null;
  recentAttendance: { id: string; sessionLabel: string; clubName: string; clubSlug: string; checkedInAt: string }[];
  registeredEvents: { id: string; title: string; startAt: string; location: string | null; source: string }[];
  upcomingDeadlines: { id: string; title: string; category: string; deadline: string }[];
  preferences: { cardOrder: DashboardCardId[]; hiddenCards: DashboardCardId[] };
};

export const dashboardCardIds = ["meeting", "attendance", "registrations", "deadlines", "notifications"] as const;
export type DashboardCardId = typeof dashboardCardIds[number];

type DashboardPayload = {
  active_clubs?: unknown;
  pending_memberships?: unknown;
  pending_applications?: unknown;
  open_support_requests?: unknown;
  managed_club_count?: unknown;
  unread_notifications?: unknown;
  next_meeting?: unknown;
  recent_attendance?: unknown;
  registered_events?: unknown;
  upcoming_deadlines?: unknown;
  preferences?: unknown;
};

function safeCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function cardIds(value: unknown): DashboardCardId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(dashboardCardIds);
  return [...new Set(value.filter((item): item is DashboardCardId => typeof item === "string" && allowed.has(item)))];
}

export function parseStudentDashboard(value: unknown): StudentDashboard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as DashboardPayload;
  const activeClubs = Array.isArray(payload.active_clubs)
    ? payload.active_clubs.flatMap((club) => {
        if (!club || typeof club !== "object") return [];
        const candidate = club as Record<string, unknown>;
        return typeof candidate.id === "string" && typeof candidate.slug === "string" && typeof candidate.name === "string"
          ? [{ id: candidate.id, slug: candidate.slug, name: candidate.name }]
          : [];
      })
    : [];
  const meeting = record(payload.next_meeting);
  const preferenceRecord = record(payload.preferences);
  const order = cardIds(preferenceRecord?.card_order);
  return {
    activeClubs,
    pendingMemberships: safeCount(payload.pending_memberships),
    pendingApplications: safeCount(payload.pending_applications),
    openSupportRequests: safeCount(payload.open_support_requests),
    managedClubCount: safeCount(payload.managed_club_count),
    unreadNotifications: safeCount(payload.unread_notifications),
    nextMeeting: meeting && text(meeting.club_id) && text(meeting.club_slug) && text(meeting.club_name) && text(meeting.starts_at) ? {
      clubId: text(meeting.club_id), clubSlug: text(meeting.club_slug), clubName: text(meeting.club_name),
      location: optionalText(meeting.location), startsAt: text(meeting.starts_at),
    } : null,
    recentAttendance: Array.isArray(payload.recent_attendance) ? payload.recent_attendance.flatMap((item) => {
      const row = record(item);
      return row && text(row.id) && text(row.session_label) && text(row.club_name) && text(row.club_slug) && text(row.checked_in_at)
        ? [{ id: text(row.id), sessionLabel: text(row.session_label), clubName: text(row.club_name), clubSlug: text(row.club_slug), checkedInAt: text(row.checked_in_at) }] : [];
    }) : [],
    registeredEvents: Array.isArray(payload.registered_events) ? payload.registered_events.flatMap((item) => {
      const row = record(item);
      return row && text(row.id) && text(row.title) && text(row.start_at)
        ? [{ id: text(row.id), title: text(row.title), startAt: text(row.start_at), location: optionalText(row.location), source: text(row.source) }] : [];
    }) : [],
    upcomingDeadlines: Array.isArray(payload.upcoming_deadlines) ? payload.upcoming_deadlines.flatMap((item) => {
      const row = record(item);
      return row && text(row.id) && text(row.title) && text(row.deadline)
        ? [{ id: text(row.id), title: text(row.title), category: text(row.category), deadline: text(row.deadline) }] : [];
    }) : [],
    preferences: {
      cardOrder: [...order, ...dashboardCardIds.filter((id) => !order.includes(id))],
      hiddenCards: cardIds(preferenceRecord?.hidden_cards),
    },
  };
}
