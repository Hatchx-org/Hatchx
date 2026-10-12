export const MAX_CLUB_TAGS = 3;

export type ClubProfileInput = {
  shortDescription: string;
  fullDescription: string;
  mission: string | null;
  activities: string | null;
  whoShouldJoin: string | null;
  membershipExpectations: string | null;
  weeklyCommitmentHours: number;
  tags: string[];
};

export function parseClubTags(values: FormDataEntryValue[]) {
  const tags = values.flatMap((value) => String(value).split(",")).map((tag) => tag.replace(/\s+/g, " ").trim()).filter(Boolean);
  const normalized = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
  if (!tags.length || tags.length > MAX_CLUB_TAGS || normalized.size !== tags.length || tags.some((tag) => tag.length < 2 || tag.length > 30)) return null;
  return tags;
}

function optionalText(value: FormDataEntryValue | null, max: number) {
  const text = String(value ?? "").trim();
  return text.length <= max ? text || null : undefined;
}

export function parseClubProfileInput(formData: FormData): ClubProfileInput | null {
  const shortDescription = String(formData.get("short_description") ?? "").trim();
  const fullDescription = String(formData.get("full_description") ?? "").trim();
  const mission = optionalText(formData.get("mission"), 1500);
  const activities = optionalText(formData.get("activities"), 3000);
  const whoShouldJoin = optionalText(formData.get("who_should_join"), 1500);
  const membershipExpectations = optionalText(formData.get("membership_expectations"), 1500);
  const weeklyCommitmentHours = Number(formData.get("weekly_commitment_hours"));
  const tags = parseClubTags(formData.getAll("interest_tags"));

  if (shortDescription.length < 10 || shortDescription.length > 1000) return null;
  if (fullDescription.length < 20 || fullDescription.length > 5000) return null;
  if ([mission, activities, whoShouldJoin, membershipExpectations].includes(undefined)) return null;
  if (!Number.isFinite(weeklyCommitmentHours) || weeklyCommitmentHours < 0 || weeklyCommitmentHours > 40 || weeklyCommitmentHours * 2 % 1 !== 0) return null;
  if (!tags) return null;

  return { shortDescription, fullDescription, mission: mission!, activities: activities!, whoShouldJoin: whoShouldJoin!, membershipExpectations: membershipExpectations!, weeklyCommitmentHours, tags };
}
