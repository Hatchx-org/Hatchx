const defaultDomains = ["nycstudents.net", "school.doe.gov", "schools.nyc.gov"];

export function getAllowedEmailDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? defaultDomains.join(","))
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined, domains = getAllowedEmailDomains()) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return domains.some((domain) => normalized.endsWith(`@${domain}`));
}
