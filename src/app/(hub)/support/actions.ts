"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { parseOptionalIsoDateTime } from "@/lib/input-validation";
import { checkRateLimit } from "@/lib/rate-limit";

export type SupportActionState = { ok: boolean; message: string } | null;

const requestTypes = [
  "technical",
  "club_support",
  "room_reservation",
  "funding",
  "fundraising_finance",
  "charter",
] as const;
const reportTypes = ["report_outdated", "report_broken_link", "report_incorrect", "report_other"] as const;

export async function submitSupportRequest(
  _previous: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in before submitting a request." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Support requests are unavailable until Supabase is configured." };

  const requestedType = String(formData.get("request_type") ?? "technical");
  const isContentReport = reportTypes.includes(requestedType as (typeof reportTypes)[number]);
  const requestType = isContentReport ? "technical" : requestedType;
  const reportLabel = requestedType.replace("report_", "").replaceAll("_", " ");
  const rawSubject = String(formData.get("subject") ?? "").trim();
  const subject = isContentReport ? `[Content report: ${reportLabel}] ${rawSubject}` : rawSubject;
  const details = String(formData.get("details") ?? "").trim();
  const requestedFor = String(formData.get("requested_for") ?? "").trim();
  if (!requestTypes.includes(requestType as (typeof requestTypes)[number])) {
    return { ok: false, message: "Choose a valid request type." };
  }
  if (rawSubject.length < 3 || subject.length > 120 || details.length < 10 || details.length > 4000) {
    return { ok: false, message: "Enter a subject and 10–4000 characters of details." };
  }
  const requestedForIso = parseOptionalIsoDateTime(requestedFor);
  if (requestedForIso === undefined) {
    return { ok: false, message: "Enter a valid requested date and time." };
  }

  const supabase = await createServerClient();
  const limit = await checkRateLimit(supabase, "support_submit");
  if (!limit.allowed && !limit.unavailable) return { ok: false, message: "Too many support requests. Try again later." };
  const { error } = await supabase.from("support_requests").insert({
    request_type: requestType as (typeof requestTypes)[number],
    submitted_by: user.id,
    subject,
    details,
    requested_for: requestedForIso,
  });
  if (error) return { ok: false, message: "Couldn't submit the request. Please try again." };
  revalidatePath("/support");
  revalidatePath("/profile");
  return { ok: true, message: "Request submitted. You can track its status below." };
}

export async function addSupportReply(_previous: SupportActionState, formData: FormData): Promise<SupportActionState> {
  const user = await getCurrentUser();
  const requestId = String(formData.get("request_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!user) return { ok: false, message: "Sign in before replying." };
  if (!isSupabaseConfigured() || !requestId || body.length < 1 || body.length > 4000) return { ok: false, message: "Enter a reply up to 4,000 characters." };
  const db = await createServerClient();
  const { error } = await db.from("support_request_updates").insert({ request_id: requestId, author_id: user.id, body, internal: false });
  if (error) return { ok: false, message: "Reply could not be sent. Check that you can access this request." };
  await db.from("support_requests").update({ updated_at: new Date().toISOString() }).eq("id", requestId);
  revalidatePath(`/support/${requestId}`);
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return { ok: true, message: "Reply sent." };
}
