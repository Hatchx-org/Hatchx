"use client";

import { useActionState, useState } from "react";
import { setTeacherClubs, setTeacherPermissions, updateUserRole } from "../actions";
import type { Role } from "@/lib/supabase/types";
type TeacherPermission = "announcements.manage" | "opportunities.manage" | "events.manage" | "support.manage" | "site.manage";
const teacherPermissions: TeacherPermission[] = ["announcements.manage", "opportunities.manage", "events.manage", "support.manage", "site.manage"];

const roles: Role[] = ["student", "teacher", "admin"];
const permissionLabels: Record<TeacherPermission, string> = {
  "announcements.manage": "Announcements",
  "opportunities.manage": "Opportunities",
  "events.manage": "Events",
  "support.manage": "Support requests",
  "site.manage": "Public content",
};

export default function UserRoleForm({ id, role, gradeLevel, permissions, clubs, assignedClubIds }: { id: string; role: Role; gradeLevel: number | null; permissions: string[]; clubs: { id: string; name: string }[]; assignedClubIds: string[] }) {
  const [selectedRole, setSelectedRole] = useState(role);
  const [state, action, pending] = useActionState(updateUserRole, null);
  return (
    <div className="flex max-w-2xl flex-wrap items-center justify-end gap-2">
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="role" value={selectedRole} onChange={event => setSelectedRole(event.target.value as Role)} aria-label="User role" className="rounded-full border border-black/10 bg-content-bg px-3 py-1.5 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
        {roles.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select name="grade_level" defaultValue={gradeLevel ?? ""} aria-label="Student grade" className="rounded-full border border-black/10 bg-content-bg px-3 py-1.5 text-xs font-semibold text-ink"><option value="">No grade</option>{[9,10,11,12].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select>
      <button type="submit" disabled={pending} className="rounded-full bg-navy px-3.5 py-1.5 text-xs font-semibold text-cream hover:bg-navy-dark disabled:opacity-50">
        {pending ? "Saving…" : "Save"}
      </button>
      {state && <span className={`basis-full text-right text-xs ${state.ok ? "text-navy" : "text-orange"}`} role={state.ok ? "status" : "alert"}>{state.message}</span>}
    </form>
    {selectedRole === "teacher" && <PermissionForm id={id} permissions={permissions} />}
    {selectedRole === "teacher" && <ClubAssignmentsForm id={id} clubs={clubs} assignedClubIds={assignedClubIds} />}
    </div>
  );
}

function ClubAssignmentsForm({ id, clubs, assignedClubIds }: { id: string; clubs: { id: string; name: string }[]; assignedClubIds: string[] }) {
  const [state, action, pending] = useActionState(setTeacherClubs, null);
  return <form action={action} className="basis-full rounded-control border border-line p-3">
    <input type="hidden" name="id" value={id} />
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-ink">Club assignments</p><p className="text-[11px] text-muted">Uncheck one or several Clubs to remove only those assignments.</p></div><button disabled={pending} className="shrink-0 rounded-full border border-navy px-3 py-1 text-xs font-semibold text-navy">{pending ? "Saving…" : "Save Clubs"}</button></div>
    <div className="mt-2 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
      {clubs.map(club => <label key={club.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs text-muted hover:bg-content-bg"><input type="checkbox" name="club_ids" value={club.id} defaultChecked={assignedClubIds.includes(club.id)} /> <span className="truncate">{club.name}</span></label>)}
      {!clubs.length && <p className="text-xs text-muted">No Clubs are available.</p>}
    </div>
    {state && <p className={state.ok ? "mt-2 text-right text-xs text-navy" : "mt-2 text-right text-xs text-orange"}>{state.message}</p>}
  </form>;
}

function PermissionForm({ id, permissions }: { id: string; permissions: string[] }) {
  const [state, action, pending] = useActionState(setTeacherPermissions, null);
  return <div className="basis-full pt-2"><div className="flex flex-wrap justify-end gap-3">
    {teacherPermissions.map(permission => <label key={permission} className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="permissions" value={permission} defaultChecked={permissions.includes(permission)} form={`permissions-${id}`} />{permissionLabels[permission]}</label>)}
    <form id={`permissions-${id}`} action={action}><input type="hidden" name="id" value={id} /><button disabled={pending} className="rounded-full border border-navy px-3 py-1 text-xs font-semibold text-navy">{pending ? "Saving…" : "Save permissions"}</button></form>
  </div>{state && <p className={`mt-1 text-right text-xs ${state.ok ? "text-navy" : "text-orange"}`}>{state.message}</p>}</div>;
}
