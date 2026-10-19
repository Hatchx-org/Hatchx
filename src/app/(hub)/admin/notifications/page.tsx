import Link from "next/link";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { publishNotification } from "./actions";

const input = "mt-1 h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

export default async function AdminNotificationsPage() {
  await requireAdmin();
  const db = await createServerClient();
  const { data: clubs } = await db.from("clubs").select("id,name").neq("status", "archived").order("name");
  return <div className="mx-auto w-full max-w-3xl px-6 py-8">
    <PageHeader title="Publish notification" subtitle="Send a one-time inbox and browser push notification. This does not send email or use Brevo quota." />
    <Link href="/admin" className="text-sm font-semibold text-navy">← Admin dashboard</Link>
    <section className="mt-5 rounded-card border border-line bg-card p-6 shadow-sm">
      <ActionFeedbackForm action={publishNotification} className="grid gap-5">
        <label className="text-sm font-semibold text-ink">Title<input name="title" required minLength={3} maxLength={160} className={input} /></label>
        <label className="text-sm font-semibold text-ink">Message<textarea name="body" required minLength={3} maxLength={2000} rows={6} className={`${input} h-auto py-3`} /></label>
        <label className="text-sm font-semibold text-ink">Audience<select name="audience" defaultValue="all" className={input}><option value="all">Everyone</option><option value="students">Students</option><option value="teachers">Teachers and staff</option><option value="admins">Administrators</option><option value="club">One Club</option></select></label>
        <label className="text-sm font-semibold text-ink">Club (required only for One Club)<select name="club_id" defaultValue="" className={input}><option value="">Select a Club</option>{clubs?.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink">Open link (optional)<input name="href" maxLength={500} placeholder="/calendar" className={input} /><span className="mt-1 block text-xs font-normal text-muted">Use a Hatchx path beginning with /.</span></label>
        <label className="flex items-start gap-3 rounded-control border border-red-200 bg-red-50 p-4 text-sm text-red-950"><input type="checkbox" name="emergency" className="mt-1" /><span><strong>Emergency alert</strong><br />Use only for urgent messages; it receives stronger visual treatment.</span></label>
        <button className="min-h-11 justify-self-start rounded-full bg-navy px-6 font-bold text-cream">Publish notification</button>
      </ActionFeedbackForm>
    </section>
  </div>;
}
