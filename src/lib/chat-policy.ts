export const CLUB_CHAT_POLICY_VERSION = "2026-10-11";

export const clubChatRules = [
  "Treat every member with respect, including when you disagree.",
  "Do not use insults, slurs, harassment, threats, or language that demeans another person or group.",
  "Do not share private, identifying, sexual, violent, or unsafe content.",
  "Keep messages relevant to the Club and follow school rules.",
] as const;

export function validChatModerationReason(value: string) {
  const reason = value.trim();
  return reason.length >= 3 && reason.length <= 500;
}
