"use client";

type Club = { id: string; name: string };
type AudienceType = "school" | "grades" | "clubs";
type Props = {
  clubs: Club[];
  audienceType: AudienceType;
  setAudienceType: (value: AudienceType) => void;
  grades: number[];
  setGrades: (value: number[]) => void;
  clubIds: string[];
  setClubIds: (value: string[]) => void;
  notifyInApp: boolean;
  setNotifyInApp: (value: boolean) => void;
  notifyEmail: boolean;
  setNotifyEmail: (value: boolean) => void;
  disabled?: boolean;
};

export default function AudienceFields(props: Props) {
  const input = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";
  const toggle = (values: number[], value: number) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const toggleId = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  return <fieldset className="grid gap-3 rounded-control border border-line bg-content-bg/50 p-4">
    <legend className="px-1 text-sm font-bold text-ink">Audience &amp; delivery</legend>
    <label className="grid gap-1 text-sm font-semibold text-ink">Who can see this announcement?
      <select name="audience_type" value={props.audienceType} onChange={(event) => props.setAudienceType(event.target.value as AudienceType)} disabled={props.disabled} className={input}>
        <option value="school">Entire school (public)</option><option value="grades">Selected grades (sign-in required)</option><option value="clubs">Selected Clubs (members only)</option>
      </select>
    </label>
    {props.audienceType === "grades" && <div><p className="text-sm font-semibold text-ink">Grades</p><div className="mt-2 flex flex-wrap gap-3">{[9,10,11,12].map((grade) => <label key={grade} className="flex items-center gap-2 text-sm"><input type="checkbox" name="audience_grades" value={grade} checked={props.grades.includes(grade)} onChange={() => props.setGrades(toggle(props.grades, grade))} /> Grade {grade}</label>)}</div></div>}
    {props.audienceType === "clubs" && <div><p className="text-sm font-semibold text-ink">Clubs</p><div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-control border border-line bg-card p-3 sm:grid-cols-2">{props.clubs.map((club) => <label key={club.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="audience_club_ids" value={club.id} checked={props.clubIds.includes(club.id)} onChange={() => props.setClubIds(toggleId(props.clubIds, club.id))} /> <span className="truncate">{club.name}</span></label>)}{!props.clubs.length && <p className="text-xs text-muted">No published Clubs are available.</p>}</div></div>}
    <div className="grid gap-2 border-t border-line pt-3">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" name="notify_in_app" checked={props.notifyInApp} onChange={(event) => { props.setNotifyInApp(event.target.checked); if (!event.target.checked) props.setNotifyEmail(false); }} /> Send an Inbox notification</label>
      <label className={`flex items-center gap-2 text-sm text-ink ${!props.notifyInApp ? "opacity-50" : ""}`}><input type="checkbox" name="notify_email" checked={props.notifyEmail} disabled={!props.notifyInApp} onChange={(event) => props.setNotifyEmail(event.target.checked)} /> Also queue an email</label>
      <p className="text-xs leading-5 text-muted">Email is placed in the secure delivery outbox. Your configured mail worker sends it; scheduled notices are queued only after their publication time.</p>
    </div>
  </fieldset>;
}
