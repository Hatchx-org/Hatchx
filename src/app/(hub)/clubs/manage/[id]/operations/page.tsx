import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import { addConstitutionVersion } from "./actions";

const field = "h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";
const area = `${field} h-auto py-3`;

function constitutionTemplate(clubName: string) {
  return `${clubName} Constitution

Article I — NAME
The name of this club/organization shall be ${clubName} of Bayside High School.

Article II — PURPOSE
The purpose of this club is…

Article III — MEMBERSHIP
Membership is open to all students in the school regardless of race, color, national origin, religion, disability, citizenship status, marital status, gender, or sexual orientation.

Article IV — OFFICIALS
Officers, responsibilities, election process, and impeachment process:

Article V — MEETINGS
When and where will the club meet? Will it meet once a week, once a month, or on another schedule?

Article VI — AMENDMENTS
An amendment may be initiated by any member of the group and passed by a 2/3 vote of the members present at the meeting.

Article VII — ABANDONMENT
Club funds shall remain in the ${clubName} Club account for a period of two years after its abandonment. If after two years the club does not continue on an active basis, all funds shall be forwarded to the Student Organization.

ADOPTED: [enter the date this Constitution was completed]`;
}

export default async function ClubOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/clubs/manage/${id}/operations`);
  if (!isSupabaseConfigured()) redirect("/clubs/manage");

  const db = await createServerClient();
  const access = await db.rpc("can_manage_club", { p_club_id: id });
  if (!access.data) redirect("/clubs/manage");

  const [club, versions] = await Promise.all([
    db.from("clubs").select("id,name").eq("id", id).maybeSingle(),
    db.from("club_constitution_versions").select("*").eq("club_id", id).order("version_number", { ascending: false }),
  ]);
  if (!club.data) notFound();

  return <div className="mx-auto max-w-5xl space-y-7 px-5 py-8">
    <header>
      <Link href={`/clubs/manage/${id}`} className="text-sm font-semibold text-powder">← {club.data.name} workspace</Link>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase text-ink">Club constitution</h1>
      <p className="mt-2 text-muted">Maintain the Club&apos;s official constitution and amendment history.</p>
    </header>

    {versions.error && <p role="alert" className="rounded-card border border-orange/40 bg-card p-5">The Constitution database is not ready. An Admin must run <code>supabase/club_constitution_elections.sql</code>.</p>}

    <section className="rounded-[20px] border border-line bg-card p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-powder">Official document</p>
      <h2 className="mt-1 text-2xl font-bold text-ink">Club constitution</h2>
      <p className="mt-2 text-sm text-muted">Saving creates a new version. Earlier versions remain available, and the newest version appears on the public Club page.</p>
      <ActionFeedbackForm action={addConstitutionVersion} className="mt-5 grid gap-3">
        <input type="hidden" name="club_id" value={id} />
        <label className="text-sm text-ink">Version or amendment summary<input name="change_summary" required minLength={5} className={`${field} mt-1`} placeholder="Initial constitution or summary of changes" /></label>
        <label className="text-sm text-ink">Adopted date (optional)<input name="adopted_on" type="date" className={`${field} mt-1`} /></label>
        <label className="text-sm text-ink">Complete constitution text<textarea name="body" required minLength={50} rows={20} defaultValue={constitutionTemplate(club.data.name)} className={`${area} mt-1`} /></label>
        <button className="h-11 rounded-full bg-navy px-5 font-bold text-cream">Save new constitution version</button>
      </ActionFeedbackForm>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-bold text-ink">Version history</h3>
        {versions.data?.length ? <div className="mt-3 space-y-3">{versions.data.map(version => <details key={version.id} className="rounded-control border border-line p-4"><summary className="cursor-pointer font-semibold text-ink">Version {version.version_number} · {version.change_summary}</summary><p className="mt-1 text-xs text-muted">{version.adopted_on ? `Adopted ${version.adopted_on}` : "Adoption date not recorded"}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{version.body}</p></details>)}</div> : <p className="mt-3 text-sm text-muted">No constitution has been saved yet.</p>}
      </div>
    </section>
  </div>;
}
