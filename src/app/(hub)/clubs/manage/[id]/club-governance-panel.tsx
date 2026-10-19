import Image from "next/image";
import ActionFeedbackForm from "@/components/action-feedback-form";
import {
  addClubAdvisor,
  addClubOfficer,
  moveClubOfficer,
  deleteClubImage,
  removeClubOfficer,
  removeClubAdvisor,
  updateClubPublication,
  updateClubImagePlacement,
  uploadOwnBoardAvatar,
  removeOwnBoardAvatar,
} from "../actions";
import type { ClubAdvisorRow, ClubAuditLogRow, ClubMediaRow, ClubOfficerRow, Role } from "@/lib/supabase/types";
import AttendancePanel from "./attendance-panel";
import ClubImageUploader from "./club-image-uploader";
import { clubMediaPermissionOptions } from "@/lib/club-media";
import ConfirmSubmitButton from "@/components/confirm-submit-button";

const input = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

export default function ClubGovernancePanel({
  clubId,
  clubStatus,
  userId,
  role,
  canGovern,
  officers,
  advisors,
  media,
  history,
}: {
  clubId: string;
  clubStatus: string;
  userId: string;
  role: Role;
  canGovern: boolean;
  officers: ClubOfficerRow[];
  advisors: ClubAdvisorRow[];
  media: ClubMediaRow[];
  history: ClubAuditLogRow[];
}) {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {["staff", "admin"].includes(role) && <section className="card-gradient rounded-[10px] p-6 lg:col-span-2"><h2 className="text-xl font-bold text-cream">Publication status</h2><p className="mt-2 text-sm text-cream/70">Publishing makes the club visible in the public directory. Draft or archived clubs stay out of the directory; existing public photo URLs are not made private.</p><ActionFeedbackForm action={updateClubPublication} className="mt-4 grid gap-3"><input type="hidden" name="club_id" value={clubId} /><label className="text-sm text-cream">Status<select name="status" defaultValue={clubStatus} className={input}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><button className="min-h-11 justify-self-start rounded-full bg-cream px-5 font-semibold text-navy">Save publication status</button></ActionFeedbackForm></section>}
      <section id="governance" className="card-gradient scroll-mt-28 rounded-[18px] p-6">
        <h2 className="font-display text-xl font-bold uppercase text-cream">Board &amp; advisors</h2>
        <p className="mt-2 text-sm text-cream/65">Board access is club-specific. Students keep their student account and may serve on more than one board.</p>
        <div className="mt-4 space-y-2">
          {officers.map((officer, index) => (
            <div key={officer.id} className="rounded-control border border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{officer.avatar_path ? <Image src={new URL(`/storage/v1/object/public/board-avatars/${officer.avatar_path}`, process.env.NEXT_PUBLIC_SUPABASE_URL).toString()} alt="" width={48} height={48} className="size-12 shrink-0 rounded-full object-cover" /> : <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-cream/10 font-bold text-cream">{(officer.display_name ?? "O").split(" ").map((word) => word[0]).join("").slice(0,2)}</div>}<div className="min-w-0"><p className="truncate font-semibold text-cream">{officer.display_name ?? "Student officer"}</p><p className="text-cream/60">{officer.title}{!officer.profile_id ? " · Account pending" : ""}</p></div></div>
              {canGovern ? <div className="flex shrink-0 items-center gap-2"><ActionFeedbackForm action={moveClubOfficer} className="flex gap-1"><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="officer_id" value={officer.id} /><button name="direction" value="up" disabled={index===0} aria-label={`Move ${officer.display_name ?? officer.title} up`} className="rounded border border-line px-2 py-1 text-xs font-bold text-cream disabled:cursor-not-allowed disabled:opacity-30">↑</button><button name="direction" value="down" disabled={index===officers.length-1} aria-label={`Move ${officer.display_name ?? officer.title} down`} className="rounded border border-line px-2 py-1 text-xs font-bold text-cream disabled:cursor-not-allowed disabled:opacity-30">↓</button></ActionFeedbackForm><ActionFeedbackForm action={removeClubOfficer}><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="officer_id" value={officer.id} /><button className="text-xs font-semibold text-orange">Remove</button></ActionFeedbackForm></div> : null}</div>
              {(officer.profile_id === userId || canGovern) && <details className="mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-xs font-semibold text-powder">{officer.avatar_path ? "Change portrait" : officer.profile_id === userId ? "Upload my portrait" : "Upload portrait"}</summary><ActionFeedbackForm action={uploadOwnBoardAvatar} className="mt-3 grid gap-2"><input type="hidden" name="club_id" value={clubId}/><input type="hidden" name="officer_id" value={officer.id}/><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required className="block w-full rounded-control border border-line p-2 text-xs text-cream file:mr-2 file:rounded-full file:border-0 file:px-3 file:py-1.5"/><p className="text-xs text-cream/55">JPG, PNG, or WebP up to 4 MB. A square portrait works best.</p><button className="justify-self-start rounded-full bg-cream px-4 py-2 text-xs font-bold text-navy">Save portrait</button></ActionFeedbackForm>{officer.avatar_path && <ActionFeedbackForm action={removeOwnBoardAvatar} className="mt-2"><input type="hidden" name="club_id" value={clubId}/><input type="hidden" name="officer_id" value={officer.id}/><button className="text-xs font-semibold text-orange">Remove portrait</button></ActionFeedbackForm>}</details>}
            </div>
          ))}
          {advisors.map((advisor) => <div key={advisor.id} className="flex items-center justify-between gap-3 rounded-control border border-line p-3 text-sm"><div className="min-w-0"><p className="truncate font-semibold text-cream">{advisor.display_name ?? "Faculty advisor"}</p><p className="truncate text-cream/60">Advisor{advisor.contact_email ? ` · ${advisor.contact_email}` : ""}</p></div>{["staff", "admin"].includes(role) ? <ActionFeedbackForm action={removeClubAdvisor}><input type="hidden" name="club_id" value={clubId}/><input type="hidden" name="advisor_id" value={advisor.id}/><button className="text-xs font-semibold text-orange">Remove</button></ActionFeedbackForm> : null}</div>)}
        </div>
        {canGovern ? (
          <ActionFeedbackForm action={addClubOfficer} className="mt-5 grid gap-3 border-t border-line pt-5">
            <h3 className="font-semibold text-cream">Add board member</h3>
            <p className="text-xs text-cream/60">Club membership is not required. If the email has not registered yet, board access activates automatically after account creation.</p>
            <input type="hidden" name="club_id" value={clubId} />
            <input name="display_name" maxLength={120} placeholder="Full name (recommended before signup)" className={input} />
            <input type="email" name="email" required placeholder="Student school email" className={input} />
            <input name="title" required minLength={2} maxLength={80} placeholder="Position, e.g. President" className={input} />
            <div className="grid grid-cols-2 gap-3"><input type="date" name="term_start" aria-label="Term start" className={input} /><input type="date" name="term_end" aria-label="Term end" className={input} /></div>
            <button className="h-10 rounded-full bg-cream px-5 font-bold text-black">Add to board</button>
          </ActionFeedbackForm>
        ) : null}
        {["staff", "admin"].includes(role) ? (
          <ActionFeedbackForm action={addClubAdvisor} className="mt-5 grid gap-3 border-t border-line pt-5">
            <h3 className="font-semibold text-cream">Add faculty advisor</h3>
            <p className="text-xs text-cream/60">Only Teacher or Advisor accounts may be listed. Admin permission remains separate and is never displayed as an advisor.</p>
            <input type="hidden" name="club_id" value={clubId} />
            <input type="email" name="email" required placeholder="Faculty school email" className={input} />
            <button className="h-10 rounded-full border border-cream px-5 font-bold text-cream">Add advisor</button>
          </ActionFeedbackForm>
        ) : null}
      </section>

      <section id="media" className="card-gradient scroll-mt-28 rounded-[18px] p-6">
        <h2 className="font-display text-xl font-bold uppercase text-cream">Media library</h2>
        <p className="mt-2 text-sm text-cream/65">Crop once, then Hatchx creates three compressed sizes automatically. Public images require useful alternative text and a confirmed sharing-permission record.</p>
        <ClubImageUploader clubId={clubId} />
        {media.length ? <ul className="mt-6 space-y-4">{media.map((item) => {
          const previewPath = item.thumbnail_path ?? item.storage_path;
          const previewUrl = new URL(`/storage/v1/object/public/club-media/${previewPath}`, process.env.NEXT_PUBLIC_SUPABASE_URL).toString();
          const fullUrl = new URL(`/storage/v1/object/public/club-media/${item.storage_path}`, process.env.NEXT_PUBLIC_SUPABASE_URL).toString();
          return <li key={item.id} className="rounded-xl border border-line p-4 text-sm">
            <div className="flex gap-3"><Image src={previewUrl} alt="" width={96} height={72} className="h-20 w-24 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-cream">{item.title ?? "Club photo"}</p>{item.is_cover && <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-navy">Cover</span>}{item.visibility === "gallery" && <span className="rounded-full border border-powder/50 px-2 py-0.5 text-[10px] font-bold text-powder">Gallery</span>}</div><p className="mt-1 line-clamp-2 text-xs text-cream/60">{item.alt_text || "Alternative text needs review"}</p><p className="mt-1 text-[11px] text-cream/45">{item.medium_path ? "3 optimized sizes" : "Legacy single-size image"} · {item.permission_basis?.replaceAll("_", " ") ?? "permission not recorded"}</p></div></div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold"><a href={fullUrl} target="_blank" rel="noreferrer" className="text-powder hover:underline">Open full size</a><details className="group basis-full"><summary className="cursor-pointer text-cream marker:text-powder">Edit details and placement</summary><ActionFeedbackForm action={updateClubImagePlacement} className="mt-4 grid gap-3 border-t border-line pt-4"><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="media_id" value={item.id} /><input name="title" maxLength={120} defaultValue={item.title ?? ""} placeholder="Photo title (optional)" className={input} /><input name="alt_text" required minLength={10} maxLength={240} defaultValue={item.alt_text ?? ""} placeholder="Meaningful alternative text" className={input} /><label className="text-xs text-cream/70">Permission record<select name="permission_basis" required defaultValue={item.permission_basis && item.permission_basis !== "legacy_review_required" ? item.permission_basis : ""} className={`${input} mt-1`}><option value="" disabled>Choose permission</option>{clubMediaPermissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><textarea name="permission_note" maxLength={500} rows={2} defaultValue={item.permission_note ?? ""} placeholder="Permission note (optional)" className={`${input} h-auto py-2`} /><div className="flex flex-wrap items-end gap-2"><label className="text-xs text-cream/70">Placement<select name="visibility" defaultValue={item.visibility} className={`${input} mt-1`}><option value="private">Private</option><option value="gallery">Gallery</option></select></label><label className="flex h-10 items-center gap-2 text-xs text-cream"><input type="checkbox" name="is_cover" defaultChecked={item.is_cover} /> Club cover</label></div><label className="flex items-start gap-2 text-xs leading-5 text-cream/70"><input type="checkbox" name="permission_confirmed" required className="mt-1" /> Confirm permission and accessibility details are accurate</label><button className="h-10 rounded-full bg-cream px-4 text-xs font-bold text-navy">Save changes</button></ActionFeedbackForm><ActionFeedbackForm action={deleteClubImage} className="mt-3"><input type="hidden" name="club_id" value={clubId} /><input type="hidden" name="media_id" value={item.id} /><ConfirmSubmitButton type="submit" confirmation="Delete this photo and all optimized sizes? This cannot be undone." className="text-xs font-semibold text-orange">Delete photo permanently</ConfirmSubmitButton></ActionFeedbackForm></details></div>
          </li>;
        })}</ul> : <p className="mt-4 text-sm text-cream/60">No photos uploaded yet.</p>}
      </section>

      <div className="lg:col-span-2"><AttendancePanel clubId={clubId} /></div>
      <section className="card-gradient rounded-[18px] p-6 lg:col-span-2">
        <h2 className="font-display text-xl font-bold uppercase text-cream">Change history</h2>
        <p className="mt-2 text-sm text-cream/65">Append-only records identify what changed and when for review or investigation.</p>
        {history.length ? <details className="mt-4"><summary className="cursor-pointer rounded-control border border-line px-4 py-3 text-sm font-semibold text-cream">Show {history.length} recent changes</summary><ol className="mt-3 max-h-[32rem] divide-y divide-line overflow-y-auto pr-2">{history.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><p className="text-cream"><span className="font-semibold capitalize">{entry.action}</span> {entry.entity_type.replaceAll("_", " ")}</p><p className="text-xs text-cream/60">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}{entry.actor_id ? ` · actor ${entry.actor_id.slice(0, 8)}` : " · system"}</p></li>)}</ol></details> : <p className="mt-4 text-sm text-cream/60">No recorded changes yet. History starts after the governance migration is applied.</p>}
      </section>
    </div>
  );
}
