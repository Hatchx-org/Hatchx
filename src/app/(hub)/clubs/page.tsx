import type { Metadata } from "next";
import { getAllClubs } from "@/lib/clubs";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import ClubBrowser from "./club-browser";

export const metadata: Metadata = {
  title: "Clubs & Teams",
};

export default async function ClubsPage() {
  const [clubs, user] = await Promise.all([getAllClubs(), getCurrentUser()]);
  let joinedClubSlugs: string[] = [];
  if (user && isSupabaseConfigured()) {
    const db = await createServerClient();
    const { data } = await db.from("club_memberships").select("club_id").eq("profile_id", user.id).eq("status", "active");
    const joinedIds = new Set((data ?? []).map((membership) => membership.club_id));
    joinedClubSlugs = clubs.filter((club) => club.id && joinedIds.has(club.id)).map((club) => club.slug);
  }
  return <ClubBrowser clubs={clubs} joinedClubSlugs={joinedClubSlugs} signedIn={Boolean(user)} />;
}
