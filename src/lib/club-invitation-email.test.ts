import assert from "node:assert/strict";
import test from "node:test";
import { buildClubInvitationEmail, deliverClubInvitationEmail } from "./club-invitation-email.ts";

test("Club invitation email includes meetings and social links safely", () => {
  const result = buildClubInvitationEmail({
    clubName: "Science & Service",
    description: "Build things and help the community.",
    clubUrl: "https://hatchx.example/clubs/science-service",
    personalMessage: "Welcome <student>!",
    meetings: [{ id: "m", club_id: "c", day_of_week: 4, start_time: "14:44:00", end_time: "15:31:00", location: "301", recurrence_note: null, created_at: "" }],
    links: [{ id: "l", club_id: "c", platform: "instagram", label: "Instagram", value: "https://instagram.com/example", sort_order: 0, created_by: null, created_at: "" }],
  });
  assert.match(result.text, /Thursday · Period 10 · 301/);
  assert.match(result.text, /Instagram/);
  assert.doesNotMatch(result.html, /Welcome <student>/);
  assert.match(result.html, /Welcome &lt;student&gt;/);
});

const deliverable = { id: 42, to_email: "student@nycstudents.net", subject: "Invitation", html_body: "<p>Join</p>", text_body: "Join" };

test("Club invitation delivery falls back from Resend to Brevo", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const original = { resend: process.env.RESEND_API_KEY, brevo: process.env.BREVO_API_KEY, from: process.env.EMAIL_FROM, brevoFrom: process.env.BREVO_EMAIL_FROM };
  const calls: Array<{ url: string; body: string }> = [];
  process.env.RESEND_API_KEY = "resend-test";
  process.env.BREVO_API_KEY = "brevo-test";
  process.env.EMAIL_FROM = "Hatchx <clubs@example.com>";
  delete process.env.BREVO_EMAIL_FROM;
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: String(init?.body ?? "") });
    return calls.length === 1
      ? new Response(JSON.stringify({ message: "Daily quota exceeded" }), { status: 429 })
      : new Response(JSON.stringify({ messageId: "brevo-123" }), { status: 201 });
  };
  try {
    const result = await deliverClubInvitationEmail(deliverable);
    assert.deepEqual(result, { ok: true, providerId: "brevo:brevo-123" });
    assert.deepEqual(calls.map((call) => call.url), ["https://api.resend.com/emails", "https://api.brevo.com/v3/smtp/email"]);
    assert.deepEqual(JSON.parse(calls[1].body).sender, { name: "Hatchx", email: "clubs@example.com" });
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("RESEND_API_KEY", original.resend);
    restoreEnv("BREVO_API_KEY", original.brevo);
    restoreEnv("EMAIL_FROM", original.from);
    restoreEnv("BREVO_EMAIL_FROM", original.brevoFrom);
  }
});

test("Club invitation delivery does not call Brevo after Resend succeeds", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const original = { resend: process.env.RESEND_API_KEY, brevo: process.env.BREVO_API_KEY, from: process.env.EMAIL_FROM };
  let calls = 0;
  process.env.RESEND_API_KEY = "resend-test";
  process.env.BREVO_API_KEY = "brevo-test";
  process.env.EMAIL_FROM = "clubs@example.com";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: "resend-123" }), { status: 200 });
  };
  try {
    const result = await deliverClubInvitationEmail(deliverable);
    assert.deepEqual(result, { ok: true, providerId: "resend:resend-123" });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("RESEND_API_KEY", original.resend);
    restoreEnv("BREVO_API_KEY", original.brevo);
    restoreEnv("EMAIL_FROM", original.from);
  }
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
