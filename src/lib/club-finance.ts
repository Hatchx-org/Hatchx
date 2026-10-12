export function parseMoneyToCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 999_999_999 ? cents : null;
}

export function parseNonNegativeMoneyToCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 999_999_999 ? cents : null;
}

export function schoolYearIsValid(value: string) {
  if (!/^\d{4}-\d{4}$/.test(value)) return false;
  return Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
}

export function daysBetween(from: string, to: string) {
  return Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}
