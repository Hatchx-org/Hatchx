import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentDashboard } from "./student-dashboard-data.ts";

test("dashboard payload keeps scoped management access", () => {
  assert.deepEqual(parseStudentDashboard({
    active_clubs: [{ id: "club-1", slug: "robotics", name: "Robotics" }],
    pending_memberships: 2,
    pending_applications: 1,
    open_support_requests: 3,
    managed_club_count: 1,
    unread_notifications: 4,
    next_meeting: { club_id: "club-1", club_slug: "robotics", club_name: "Robotics", location: "305", starts_at: "2026-10-05T19:00:00Z" },
    recent_attendance: [],
    registered_events: [],
    upcoming_deadlines: [],
    preferences: { card_order: ["notifications", "meeting"], hidden_cards: ["period"] },
  }), {
    activeClubs: [{ id: "club-1", slug: "robotics", name: "Robotics" }],
    pendingMemberships: 2,
    pendingApplications: 1,
    openSupportRequests: 3,
    managedClubCount: 1,
    unreadNotifications: 4,
    nextMeeting: { clubId: "club-1", clubSlug: "robotics", clubName: "Robotics", location: "305", startsAt: "2026-10-05T19:00:00Z" },
    recentAttendance: [],
    registeredEvents: [],
    upcomingDeadlines: [],
    preferences: { cardOrder: ["notifications", "meeting", "attendance", "registrations", "deadlines"], hiddenCards: [] },
  });
});

test("dashboard payload rejects invalid roots and sanitizes malformed fields", () => {
  assert.equal(parseStudentDashboard(null), null);
  assert.deepEqual(parseStudentDashboard({ active_clubs: [{ id: 1 }], pending_memberships: -4 }), {
    activeClubs: [],
    pendingMemberships: 0,
    pendingApplications: 0,
    openSupportRequests: 0,
    managedClubCount: 0,
    unreadNotifications: 0,
    nextMeeting: null,
    recentAttendance: [],
    registeredEvents: [],
    upcomingDeadlines: [],
    preferences: { cardOrder: ["meeting", "attendance", "registrations", "deadlines", "notifications"], hiddenCards: [] },
  });
});
