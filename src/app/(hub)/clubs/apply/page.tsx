import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import ApplyForm from "../apply-form";

export const metadata: Metadata = {
  title: "Apply for a New Club",
};

export default async function ClubApplyPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader
        title="Apply for a New Club"
        subtitle="Teachers can propose a new Club for Admin review. Approval publishes the Club and gives the submitting teacher its Advisor workspace."
      />

      <p className="text-sm text-muted">
        <Link href="/clubs" className="font-semibold text-powder hover:text-cream">
          ← Back to Activities &amp; Clubs
        </Link>
      </p>

      {!user && (
        <div className="card-gradient mt-8 rounded-[10px] p-6 text-center sm:p-8">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-cream">
            Teacher sign-in required
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-cream/70">
            New Club applications must be submitted by a Bayside teacher so every
            approved Club begins with an accountable Advisor.
          </p>
          <Link
            href="/login?next=/clubs/apply"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-[22px] bg-cream px-8 font-display text-sm font-extrabold tracking-wide text-black transition-colors hover:bg-white"
          >
            Sign in with Google
          </Link>
        </div>
      )}

      {user?.role === "teacher" ? <ApplyForm defaultEmail={user.email} /> : null}

      {user && user.role !== "teacher" ? (
        <div className="mt-8 rounded-card border border-line bg-card p-6 text-center sm:p-8">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Teacher submission only</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">Ask a Bayside teacher who will serve as the Club Advisor to submit the proposal. Students can still help prepare the Club name, purpose, meeting plan, and activities.</p>
          <Link href="/clubs" className="mt-5 inline-flex h-11 items-center rounded-full bg-navy px-6 text-sm font-bold text-cream">Browse existing Clubs</Link>
        </div>
      ) : null}

      <section className="mt-8 rounded-card border border-line bg-card p-6">
        <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
          What happens next?
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>A teacher submits the proposal and becomes the accountable applicant.</li>
          <li>An Admin reviews the application in the Manage Clubs queue.</li>
          <li>Approval publishes the Club on Activities &amp; Clubs automatically.</li>
          <li>The submitting teacher is assigned as Advisor and can immediately manage the Club profile, members, content, attendance, finance, and operations.</li>
          <li>
            Questions? Visit{" "}
            <Link href="/support#club-support" className="font-semibold text-powder hover:text-cream">
              Club Support
            </Link>{" "}
            for chartering guides.
          </li>
        </ol>
      </section>
    </div>
  );
}
