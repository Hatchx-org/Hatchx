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

export async function deliverClubInvitationEmail(message: DeliverableClubInvitationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false as const, retryable: true, error: "Email delivery is not configured" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `club-invitation/${message.id}` },
      body: JSON.stringify({ from, to: [message.to_email], subject: message.subject, html: message.html_body, text: message.text_body }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) return { ok: false as const, retryable: response.status === 429 || response.status >= 500, error: body.message ?? `Email provider returned ${response.status}` };
    return { ok: true as const, providerId: body.id ?? null };
  } catch (error) {
    return { ok: false as const, retryable: true, error: error instanceof Error ? error.message : "Email request failed" };
  }
}
