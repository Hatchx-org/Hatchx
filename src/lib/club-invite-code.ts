export const CLUB_INVITE_CODE_LENGTH = 6;

// Omits visually ambiguous characters such as 0/O and 1/I.
const CLUB_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateClubInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CLUB_INVITE_CODE_LENGTH));
  return Array.from(bytes, (byte) => CLUB_INVITE_ALPHABET[byte % CLUB_INVITE_ALPHABET.length]).join("");
}
