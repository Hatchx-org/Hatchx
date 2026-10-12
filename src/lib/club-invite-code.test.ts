import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_INVITE_CODE_LENGTH, generateClubInviteCode } from "./club-invite-code.ts";

test("Club invite codes are short and avoid ambiguous characters", () => {
  const codes = Array.from({ length: 100 }, () => generateClubInviteCode());
  assert.ok(codes.every((code) => code.length === CLUB_INVITE_CODE_LENGTH));
  assert.ok(codes.every((code) => /^[A-HJ-NP-Z2-9]{6}$/.test(code)));
});
