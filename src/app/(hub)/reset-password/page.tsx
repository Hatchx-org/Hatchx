import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import ActionFeedbackForm from "@/components/action-feedback-form";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  return <section className="mx-auto max-w-xl space-y-5 px-5 py-10 text-cream">
    <h1 className="text-3xl font-bold">Reset password</h1>
    {user ? <ActionFeedbackForm action={updatePassword} className="grid gap-4 rounded-xl border border-white/15 p-5">
      <p>Choose a new password for {user.email}.</p>
      <label className="grid gap-2">New password<input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" className="min-h-11 rounded-lg bg-white/10 px-3" /></label>
      <label className="grid gap-2">Confirm password<input type="password" name="confirm_password" required minLength={12} maxLength={128} autoComplete="new-password" className="min-h-11 rounded-lg bg-white/10 px-3" /></label>
      <button className="min-h-11 rounded-full bg-cream px-5 font-semibold text-navy">Update password</button>
      <Link href="/profile" className="underline">Return to Profile</Link>
    </ActionFeedbackForm> : <><p>Open the reset link from your school email in the browser where you requested it. If the link has expired, request a new one.</p><Link href="/login?mode=recovery" className="inline-flex min-h-11 items-center rounded-full bg-cream px-5 text-navy">Request reset email</Link></>}
  </section>;
}
