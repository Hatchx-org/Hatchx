export const clubMediaPermissionOptions = [
  { value: "no_people", label: "No identifiable people" },
  { value: "school_approved", label: "Approved by school staff" },
  { value: "participant_consent", label: "People shown gave permission" },
  { value: "guardian_consent", label: "Parent or guardian permission recorded" },
] as const;

export type ClubMediaPermission = (typeof clubMediaPermissionOptions)[number]["value"];

export function isClubMediaPermission(value: string): value is ClubMediaPermission {
  return clubMediaPermissionOptions.some((option) => option.value === value);
}

export function isMeaningfulAltText(value: string) {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 10 || normalized.length > 240) return false;
  return !/^(image|photo|picture|club photo|club image|untitled)([.! ]*)$/i.test(normalized);
}
