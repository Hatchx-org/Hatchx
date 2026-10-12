import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  const { id, attachmentId } = await params;
  if (!user) return NextResponse.redirect(new URL(`/login?next=/clubs/manage/${id}/finance`, request.url), 303);
  const db = await createServerClient();
  const access = await db.rpc("can_manage_club", { p_club_id: id });
  if (!access.data) return new NextResponse("Not authorized", { status: 403 });
  const attachment = await db.from("club_reimbursement_attachments").select("storage_path,reimbursement_id").eq("id", attachmentId).maybeSingle();
  if (!attachment.data) return new NextResponse("Attachment not found", { status: 404 });
  const ticket = await db.from("club_reimbursements").select("id").eq("id", attachment.data.reimbursement_id).eq("club_id", id).maybeSingle();
  if (!ticket.data) return new NextResponse("Attachment not found", { status: 404 });
  const signed = await db.storage.from("club-receipts").createSignedUrl(attachment.data.storage_path, 60);
  if (signed.error || !signed.data?.signedUrl) return new NextResponse("Attachment is unavailable", { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl, 302);
}
