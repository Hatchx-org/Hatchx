"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

type EditableProfile = {
  fullName: string;
  osisNumber: string;
  gradeLevel: number | null;
  soNumber: string;
  student: boolean;
};

const input = "mt-1 h-11 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink outline-none focus:border-powder focus:ring-2 focus:ring-powder/20";

export default function ProfileForm({ profile, next, onboarding = false }: { profile: EditableProfile; next?: string; onboarding?: boolean }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, null);
  return <form action={action} className={onboarding ? "mt-7 grid gap-4" : "mt-4 grid gap-4 border-t border-line pt-4"}>
    {next ? <input type="hidden" name="next" value={next} /> : null}
    <label className="text-xs font-medium text-muted">Full name
      <input name="full_name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={profile.fullName} className={input} />
    </label>
    {profile.student ? <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-muted">OSIS number
        <input name="osis_number" required inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} autoComplete="off" defaultValue={profile.osisNumber} placeholder="9 digits" className={input} />
      </label>
      <label className="text-xs font-medium text-muted">Grade level
        <select name="grade_level" required defaultValue={profile.gradeLevel ?? ""} className={input}>
          <option value="" disabled>Select grade</option>
          {[9, 10, 11, 12].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}
        </select>
      </label>
    </div> : null}
    <label className="text-xs font-medium text-muted">SO number <span className="font-normal">(optional)</span>
      <input name="so_number" maxLength={50} autoComplete="off" defaultValue={profile.soNumber} placeholder="Add your SO number" className={input} />
    </label>
    <p className="text-xs leading-5 text-muted">Your role, permissions, school email, and account security settings cannot be changed here.</p>
    <button disabled={pending} className="h-11 rounded-full bg-navy px-5 text-sm font-bold text-cream disabled:opacity-60">{pending ? "Saving…" : onboarding ? "Save and continue" : "Save profile"}</button>
    {state ? <p role={state.ok ? "status" : "alert"} className={`text-sm font-semibold ${state.ok ? "text-powder" : "text-orange"}`}>{state.message}</p> : null}
  </form>;
}
