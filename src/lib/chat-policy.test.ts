import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_CHAT_POLICY_VERSION, clubChatRules, validChatModerationReason } from "./chat-policy.ts";

test("chat policy is versioned and contains concrete conduct rules", () => {
  assert.match(CLUB_CHAT_POLICY_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(clubChatRules.length >= 4);
  assert.ok(clubChatRules.some((rule) => /respect/i.test(rule)));
  assert.ok(clubChatRules.some((rule) => /insults|slurs|harassment/i.test(rule)));
});

test("moderation reasons are meaningful and bounded", () => {
  assert.equal(validChatModerationReason("no"), false);
  assert.equal(validChatModerationReason("Repeated insulting language"), true);
  assert.equal(validChatModerationReason("x".repeat(501)), false);
});
