export type AnnouncementAudienceType = "school" | "grades" | "clubs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeAnnouncementAudience(input: { audienceType: string; audienceGrades: number[]; audienceClubIds: string[] }) {
  if (!["school", "grades", "clubs"].includes(input.audienceType)) return null;
  const type = input.audienceType as AnnouncementAudienceType;
  const grades = [...new Set(input.audienceGrades)].filter((grade) => Number.isInteger(grade) && grade >= 9 && grade <= 12);
  const clubs = [...new Set(input.audienceClubIds)].filter((id) => uuid.test(id));
  if (type === "grades" && grades.length === 0) return null;
  if (type === "clubs" && clubs.length === 0) return null;
  return { audience_type: type, audience_grades: type === "grades" ? grades : [], audience_club_ids: type === "clubs" ? clubs : [] };
}
