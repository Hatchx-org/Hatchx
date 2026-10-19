"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import Link from "next/link";
import { rememberDeviceCookie } from "@/lib/supabase/auth-session";
import { isStudentEmail, MAX_INVITE_CODES, normalizeGrade, normalizeInviteCodes, normalizeOsis } from "@/lib/student-registration";

const fieldClass = "min-h-11 w-full rounded-xl border border-[#c7cede] bg-white px-3.5 text-[16px] text-[#172033] outline-none transition focus:border-[#4969d1] focus:ring-4 focus:ring-[#4969d1]/10";

/** Email registration requires verification; database triggers assign roles. */
export default function EmailAccount({ next, recovery = false }: { next: string; recovery?: boolean }) {
  const [mode, setMode] = useState<"login" | "signup" | "recovery">(recovery ? "recovery" : "login");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [remember, setRemember] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteFields, setInviteFields] = useState([""]);
  const studentSignup = mode === "signup" && isStudentEmail(email);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    if (mode === "signup" && !/^[^@\s]+@(nycstudents\.net|school\.doe\.gov|schools\.nyc\.gov)$/.test(email)) {
      setMessage("Register with your NYC Public Schools student or staff email.");
      return;
    }
    const student = mode === "signup" && isStudentEmail(email);
    const osis = student ? normalizeOsis(String(form.get("osis") ?? "")) : null;
    const grade = student ? normalizeGrade(String(form.get("grade") ?? "")) : null;
    if (student && (!osis || !grade)) {
      setMessage("Students must enter a valid 9-digit OSIS number and select grade 9–12.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      if (mode === "login") rememberDeviceCookie(remember);
      const client = createBrowserClient();
      if (mode === "recovery") {
        rememberDeviceCookie(false);
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        setMessage(error ? "Unable to send the recovery email. Try again later or contact Support." : "If this address has an account, you will receive a password reset email. Use the newest link and open it in this browser.");
      } else if (mode === "signup") {
        const inviteCodes = normalizeInviteCodes(form.getAll("invite_code").map(String));
        const { error } = await client.auth.signUp({ email, password, options: {
          data: { full_name: String(form.get("name")).trim(), osis_number: osis, grade_level: grade, invite_codes: inviteCodes },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        } });
        setMessage(error ? "Registration could not complete. Check your information or contact Support." : "Check your school email to confirm your account. Any valid Club invitation codes have been applied.");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) setMessage("Sign-in failed. Check your email and password, and confirm your email first.");
        else window.location.assign(next);
      }
    } catch {
      setMessage("Unable to connect. Please try again.");
    } finally { setPending(false); }
  }
  function updateInvite(index: number, value: string) {
    setInviteFields((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }
  return <section className="login-email text-[#232b3b]">
    <div className="mb-3 flex gap-2" aria-label="Account options">
      {(["login", "signup"] as const).map(value => <button key={value} disabled={pending} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setMessage(""); }} className={`min-h-10 flex-1 rounded-full px-3 text-sm font-semibold ${mode === value ? "bg-[#263a99] text-white" : "bg-black/5"}`}>{value === "signup" ? "Create account" : "Email sign in"}</button>)}
    </div>
    <form onSubmit={submit} className="grid gap-3.5">
      {mode === "signup" && <label className="grid gap-1 text-sm">Full name<input name="name" required maxLength={120} autoComplete="name" className="min-h-10 rounded-lg border border-black/20 bg-white px-3" /></label>}
      <label className="grid gap-1 text-sm">School email<input name="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} className={fieldClass} /></label>
      {studentSignup && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">OSIS number<input name="osis" required inputMode="numeric" pattern="[0-9]{9}" minLength={9} maxLength={9} autoComplete="off" placeholder="9 digits" className={fieldClass} /></label><label className="grid gap-1 text-sm">Grade<select name="grade" required defaultValue="" className={fieldClass}><option value="" disabled>Select grade</option>{[9, 10, 11, 12].map((grade) => <option key={grade} value={grade}>Grade {grade}</option>)}</select></label></div>}
      {mode !== "recovery" && <label className="grid gap-1 text-sm">Password<input name="password" type="password" required minLength={mode === "signup" ? 12 : 1} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} className={fieldClass} /></label>}
      {mode === "recovery" && <p className="text-sm">We will email you a link to reset your password.</p>}
      {mode === "signup" && <fieldset className="rounded-xl border border-black/10 bg-black/[.03] p-3"><legend className="px-1 text-sm font-semibold">Club invitation codes <span className="font-normal text-[#697386]">(optional)</span></legend><p className="mb-2 text-xs leading-5 text-[#697386]">Enter the 6-character codes Clubs gave you. You can use more than one.</p><div className="grid gap-2">{inviteFields.map((value, index) => <div key={index} className="flex gap-2"><input name="invite_code" value={value} onChange={(event) => updateInvite(index, event.currentTarget.value)} maxLength={32} autoCapitalize="characters" placeholder={`Invite code ${index + 1}`} className={fieldClass} />{inviteFields.length > 1 && <button type="button" onClick={() => setInviteFields((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove invite code ${index + 1}`} className="min-h-11 shrink-0 rounded-xl border border-black/15 px-3 font-bold">×</button>}</div>)}</div>{inviteFields.length < MAX_INVITE_CODES && <button type="button" onClick={() => setInviteFields((current) => [...current, ""])} className="mt-2 text-xs font-semibold text-[#263a99]">+ Add another code</button>}</fieldset>}
      {mode === "signup" && <p className="text-xs leading-5">Use at least 12 characters. Student accounts require OSIS and grade verification; staff access follows the school email domain.</p>}
      {message && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm leading-5 text-blue-950">{message}</p>}
      {mode === "signup" && <label className="flex items-start gap-2 text-xs leading-5"><input name="terms" type="checkbox" required className="mt-1" /><span>I have read the <Link href="/privacy" className="underline">Privacy Policy</Link> and agree to the <Link href="/terms" className="underline">Terms of Use</Link>.</span></label>}
      {mode === "login" && <label className="flex items-center gap-2 text-xs leading-5"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember this device (avoid on shared computers)</label>}
      <button disabled={pending || !isSupabaseConfigured()} className="min-h-10 rounded-full bg-[#263a99] px-4 font-semibold text-white disabled:opacity-50">{pending ? "Please wait…" : mode === "signup" ? "Create account" : mode === "recovery" ? "Send reset link" : "Sign in"}</button>
    </form>
    {mode === "login" && <button type="button" disabled={pending} onClick={() => { setMode("recovery"); setMessage(""); }} className="mt-2 min-h-10 text-sm text-[#263a99] underline">Forgot password?</button>}
  </section>;
}
