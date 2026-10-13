import type { ClubLinkRow, ClubMeetingRow } from "./supabase/types.ts";
import { bellPeriodFromStartTime } from "./bell-schedule.ts";

type InvitationEmailInput = {
  clubName: string;
  description: string;
  clubUrl: string;
  personalMessage?: string | null;
  links: ClubLinkRow[];
  meetings: ClubMeetingRow[];
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

function meetingLabel(meeting: ClubMeetingRow) {
  const period = bellPeriodFromStartTime(meeting.start_time);
  return `${weekdays[meeting.day_of_week - 1] ?? "Meeting"}${period ? ` · Period ${period.period}` : ""}${meeting.location ? ` · ${meeting.location}` : ""}`;
}

export function buildClubInvitationEmail(input: InvitationEmailInput) {
  const socialText = input.links.map((link) => `${link.label}: ${link.value}`);
  const meetingText = input.meetings.map(meetingLabel);
  const text = [
    `You are invited to join ${input.clubName} on Hatchx.`,
    input.personalMessage?.trim(),
    input.description,
    meetingText.length ? `Meetings:\n${meetingText.map((item) => `- ${item}`).join("\n")}` : "",
    socialText.length ? `Club links:\n${socialText.map((item) => `- ${item}`).join("\n")}` : "",
    `Create your Hatchx account using this same school email address. You will join the Club automatically: ${input.clubUrl}`,
  ].filter(Boolean).join("\n\n");
  const linkItems = input.links.map((link) => {
    const safeValue = escapeHtml(link.value);
    const value = /^https?:\/\//i.test(link.value) ? `<a href="${safeValue}">${safeValue}</a>` : `<strong>${safeValue}</strong>`;
    return `<li>${escapeHtml(link.label)}: ${value}</li>`;
  }).join("");
  const meetingItems = meetingText.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033"><h1 style="color:#263a99">You’re invited to ${escapeHtml(input.clubName)}</h1>${input.personalMessage?.trim() ? `<p style="padding:14px;background:#f2f5ff;border-radius:10px">${escapeHtml(input.personalMessage.trim())}</p>` : ""}<p>${escapeHtml(input.description)}</p>${meetingItems ? `<h2>Meeting information</h2><ul>${meetingItems}</ul>` : ""}${linkItems ? `<h2>Club links and social media</h2><ul>${linkItems}</ul>` : ""}<p><a href="${escapeHtml(input.clubUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#263a99;color:white;text-decoration:none;font-weight:bold">Create account and join</a></p><p style="font-size:13px;color:#697386">Register with the same school email address that received this message. Hatchx will add you to the Club automatically.</p></div>`;
  return { subject: `You’re invited to join ${input.clubName} on Hatchx`, html, text };
}

export type DeliverableClubInvitationEmail = { id: number; to_email: string; subject: string; html_body: string; text_body: string };

type DeliveryFailure = { ok: false; retryable: boolean; error: string };
type DeliverySuccess = { ok: true; providerId: string | null };

function sender(value: string) {
  const match = value.trim().match(/^(.+?)\s*<([^<>]+)>$/);
  return match ? { name: match[1].trim(), email: match[2].trim() } : { email: value.trim() };
}

async function sendWithResend(message: DeliverableClubInvitationEmail, apiKey: string, from: string): Promise<DeliverySuccess | DeliveryFailure> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `club-invitation/${message.id}` },
      body: JSON.stringify({ from, to: [message.to_email], subject: message.subject, html: message.html_body, text: message.text_body }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) return { ok: false, retryable: response.status === 429 || response.status >= 500, error: `Resend: ${body.message ?? `HTTP ${response.status}`}` };
    return { ok: true, providerId: `resend:${body.id ?? "accepted"}` };
  } catch (error) {
    return { ok: false, retryable: true, error: `Resend: ${error instanceof Error ? error.message : "request failed"}` };
  }
}

async function sendWithBrevo(message: DeliverableClubInvitationEmail, apiKey: string, from: string): Promise<DeliverySuccess | DeliveryFailure> {
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: sender(from),
        to: [{ email: message.to_email }],
        subject: message.subject,
        htmlContent: message.html_body,
        textContent: message.text_body,
        headers: { "Idempotency-Key": `club-invitation/${message.id}` },
        tags: ["club-invitation"],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { messageId?: string; message?: string; code?: string };
    if (!response.ok) return { ok: false, retryable: response.status === 429 || response.status >= 500, error: `Brevo: ${body.message ?? body.code ?? `HTTP ${response.status}`}` };
    return { ok: true, providerId: `brevo:${body.messageId ?? "accepted"}` };
  } catch (error) {
    return { ok: false, retryable: true, error: `Brevo: ${error instanceof Error ? error.message : "request failed"}` };
  }
}

export async function deliverClubInvitationEmail(message: DeliverableClubInvitationEmail): Promise<DeliverySuccess | DeliveryFailure> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { ok: false, retryable: true, error: "EMAIL_FROM is not configured" };

  const failures: DeliveryFailure[] = [];
  if (process.env.RESEND_API_KEY) {
    const result = await sendWithResend(message, process.env.RESEND_API_KEY, from);
    if (result.ok) return result;
    failures.push(result);
  }
  if (process.env.BREVO_API_KEY) {
    const result = await sendWithBrevo(message, process.env.BREVO_API_KEY, process.env.BREVO_EMAIL_FROM || from);
    if (result.ok) return result;
    failures.push(result);
  }

  if (!failures.length) return { ok: false, retryable: true, error: "RESEND_API_KEY and BREVO_API_KEY are not configured" };
  return { ok: false, retryable: failures.some((failure) => failure.retryable), error: failures.map((failure) => failure.error).join("; ") };
}
