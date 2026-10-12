export type ClubCompletenessInput = {
  short_description: string;
  interest_tags: string[];
  contact_email: string | null;
  google_classroom_code: string | null;
  active_start_date: string | null;
  active_end_date: string | null;
};

export function clubCompleteness(club: ClubCompletenessInput) {
  const checks = [
    club.short_description.trim().length >= 20,
    club.interest_tags.length > 0,
    Boolean(club.contact_email),
    Boolean(club.google_classroom_code),
    Boolean(club.active_start_date),
    Boolean(club.active_end_date),
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}
