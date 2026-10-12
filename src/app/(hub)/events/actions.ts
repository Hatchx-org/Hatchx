"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import { getEvent } from "@/lib/events";

export type RsvpState = { count: number; joined: boolean; available: boolean };

export async function getEventRsvpInfo(eventId: string): Promise<RsvpState> {
  const event = isSupabaseConfigured() ? await getEvent(eventId) : null;
  if (!event || event.meetingEffect) {
    return { count: 0, joined: false, available: false };
  }

  const user = await getCurrentUser();
  const supabase = await createServerClient();
  const { data: count, error } = await supabase
    .rpc("event_rsvp_count", { p_event_id: eventId });
  if (error) return { count: 0, joined: false, available: false };

  let joined = false;
  if (user) {
    const { data: row } = await supabase
      .from("event_rsvps")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_id", eventId)
      .maybeSingle();
    joined = Boolean(row);
  }
  return { count: Number(count ?? 0), joined, available: true };
}

export async function toggleEventRsvp(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const event = isSupabaseConfigured() ? await getEvent(eventId) : null;
  if (!user || !event || event.meetingEffect) return;

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("event_rsvps")
    .select("id")
    .eq("user_id", user.id)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    await supabase.from("event_rsvps").delete().eq("id", existing.id);
  } else {
    const { error } = await supabase
      .from("event_rsvps")
      .insert({ user_id: user.id, event_id: eventId });
    if (error) return;
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/calendar");
}
