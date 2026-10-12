export const STUDENT_EMAIL_DOMAIN = "nycstudents.net";
export const MAX_INVITE_CODES = 8;

export function isStudentEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}

export function normalizeOsis(value: string) {
  const normalized = value.replace(/\D/g, "");
  return /^\d{9}$/.test(normalized) ? normalized : null;
}

export function normalizeGrade(value: string) {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= 9 && grade <= 12 ? grade : null;
}

export function normalizeInviteCodes(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "")).filter(Boolean))].slice(0, MAX_INVITE_CODES);
}
