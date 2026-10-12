import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  const inputClass = "min-h-12 rounded-control border border-line bg-content-bg px-4 text-ink shadow-inner outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20";
  return <section className="mx-auto max-w-xl space-y-5 px-5 py-10 text-ink">
    <h1 className="font-display text-3xl font-bold sm:text-4xl">Reset password</h1>
    {user ? <ActionFeedbackForm action={updatePassword} className="grid gap-5 rounded-card border border-line bg-card p-5 shadow-sm sm:p-7">
      <p className="leading-6 text-muted">Choose a new password for <span className="font-semibold text-ink">{user.email}</span>.</p>
      <label className="grid gap-2 font-semibold">New password<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" className={inputClass} /></label>
      <label className="grid gap-2 font-semibold">Confirm password<input type="password" name="confirm_password" required minLength={12} maxLength={128} autoComplete="new-password" className={inputClass} /></label>
      <p className="text-xs leading-5 text-muted">Use 12–128 characters. Both entries must match.</p>
      <button className="min-h-12 rounded-full bg-navy px-5 font-semibold text-cream shadow-sm transition hover:bg-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Update password</button>
      <Link href="/profile" className="w-fit font-semibold text-ink underline decoration-powder decoration-2 underline-offset-4 hover:text-navy">Return to Profile</Link>
    </ActionFeedbackForm> : <div className="rounded-card border border-line bg-card p-5 shadow-sm sm:p-7"><p className="leading-7 text-muted">Open the reset link from your school email in the browser where you requested it. If the link has expired, request a new one.</p><Link href="/login?mode=recovery" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-navy px-5 font-semibold text-cream">Request reset email</Link></div>}
  </section>;
}
