"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";

type FaqActionState = { ok: boolean; message: string } | null;

export async function saveSupportFaq(_previous: FaqActionState, formData: FormData): Promise<FaqActionState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false, message: "Administrators only." };
  if (!isSupabaseConfigured()) return { ok: false, message: "FAQ publishing requires Supabase." };
  const requestId = String(formData.get("request_id") ?? "");
  const faqId = String(formData.get("faq_id") ?? "");
  const intent = String(formData.get("intent") ?? "publish");
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) return { ok: false, message: "Invalid support request." };
  const db = await createServerClient();
  const { data: request } = await db.from("support_requests").select("id").eq("id", requestId).maybeSingle();
  if (!request) return { ok: false, message: "Support request not found." };
  if (intent === "unpublish") {
    if (!faqId) return { ok: false, message: "FAQ not found." };
    const { error } = await db.from("support_faqs").update({ published: false, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", faqId).eq("source_request_id", requestId);
    if (error) return { ok: false, message: "FAQ could not be unpublished. Apply supabase/schema.sql first." };
    revalidatePath("/support"); revalidatePath(`/support/${requestId}`);
    return { ok: true, message: "FAQ removed from the public Support page." };
  }
  if (question.length < 5 || question.length > 180 || answer.length < 10 || answer.length > 4000) return { ok: false, message: "Use a 5–180 character question and a 10–4,000 character answer." };
  const payload = { source_request_id: requestId, question, answer, published: true, updated_by: user.id, updated_at: new Date().toISOString() };
  const result = faqId ? await db.from("support_faqs").update(payload).eq("id", faqId).eq("source_request_id", requestId) : await db.from("support_faqs").insert({ ...payload, created_by: user.id });
  if (result.error) return { ok: false, message: "FAQ could not be saved. Apply supabase/schema.sql first." };
  revalidatePath("/support"); revalidatePath(`/support/${requestId}`);
  return { ok: true, message: faqId ? "FAQ updated and published." : "Question and answer published to FAQ." };
}
