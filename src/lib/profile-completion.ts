import { safeNextPath } from "./navigation.ts";

export type StudentProfileFields = {
  role: string;
  osis_number: string | null;
  grade_level: number | null;
};

export function studentProfileNeedsCompletion(profile: StudentProfileFields | null | undefined) {
  return Boolean(
    profile?.role === "student"
      && (!/^\d{9}$/.test(profile.osis_number ?? "")
        || ![9, 10, 11, 12].includes(profile.grade_level ?? 0)),
  );
}

export function profileCompletionPath(next: string | null | undefined) {
  return `/profile/complete?next=${encodeURIComponent(safeNextPath(next))}`;
}
