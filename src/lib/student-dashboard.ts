import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { parseStudentDashboard, type StudentDashboard } from "./student-dashboard-data";

export type { StudentDashboard } from "./student-dashboard-data";

function missingDashboardRpc(code: string | undefined) {
  return ["42883", "PGRST202"].includes(code ?? "");
}

export const getStudentDashboard = cache(async (): Promise<StudentDashboard | null> => {
  const user = await getCurrentUser();
  if (!user || !isSupabaseConfigured()) return null;

  const supabase = await createServerClient();
  const dashboardResult = await supabase.rpc("get_home_dashboard", {});
  if (!dashboardResult.error) {
    const dashboard = parseStudentDashboard(dashboardResult.data);
    if (dashboard) return dashboard;
    throw new Error("Home dashboard returned an invalid response.");
  }
  if (!missingDashboardRpc(dashboardResult.error.code)) {
    throw new Error(`Home dashboard could not be loaded: ${dashboardResult.error.message}`);
  }

  // Compatibility path for deployments that have not applied home_dashboard.sql yet.
  const [membershipsResult, applicationsResult, supportResult, managedResult] = await Promise.all([
    supabase.from("club_memberships").select("club_id, status").eq("profile_id", user.id).in("status", ["active", "pending"]),
    supabase.from("club_applications").select("id", { count: "exact", head: true }).eq("submitted_by", user.id).eq("status", "pending"),
    supabase.from("support_requests").select("id", { count: "exact", head: true }).eq("submitted_by", user.id).in("status", ["open", "in_review"]),
    supabase.rpc("get_managed_club_ids", {}),
  ]);

  const firstError = [membershipsResult.error, applicationsResult.error, supportResult.error, managedResult.error].find(Boolean);
  if (firstError) throw new Error(`Home dashboard fallback could not be loaded: ${firstError?.message}`);

  const memberships = membershipsResult.data ?? [];
  const activeIds = memberships.filter((membership) => membership.status === "active").map((membership) => membership.club_id);
  const clubsResult = activeIds.length
    ? await supabase.from("clubs").select("id, slug, name").in("id", activeIds)
    : { data: [] as { id: string; slug: string; name: string }[], error: null };
  if (clubsResult.error) throw new Error(`Home dashboard Clubs could not be loaded: ${clubsResult.error.message}`);

  return {
    activeClubs: clubsResult.data ?? [],
    pendingMemberships: memberships.filter((membership) => membership.status === "pending").length,
    pendingApplications: applicationsResult.count ?? 0,
    openSupportRequests: supportResult.count ?? 0,
    managedClubCount: managedResult.data?.length ?? 0,
    unreadNotifications: 0,
    nextMeeting: null,
    recentAttendance: [],
    registeredEvents: [],
    upcomingDeadlines: [],
    preferences: { cardOrder: ["meeting", "attendance", "registrations", "deadlines", "notifications"], hiddenCards: [] },
  };
});
