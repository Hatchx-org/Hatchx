"use client";

import { useActionState } from "react";
import { submitClubApplication } from "./actions";
import { clubCategories } from "@/lib/data";

const inputClasses =
  "w-full rounded-control border border-line bg-content-bg px-4 py-2.5 text-sm text-ink outline-none transition-shadow placeholder:text-muted focus:border-powder focus:ring-2 focus:ring-powder/20 disabled:opacity-50";

export default function ApplyForm({
  defaultEmail,
}: {
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(submitClubApplication, null);

  return (
    <form action={formAction} className="card-gradient mt-8 flex flex-col gap-5 rounded-[10px] p-6 sm:p-8">
      <div>
        <label htmlFor="club_name" className="mb-1.5 block text-sm font-semibold text-cream">
          Club name
        </label>
        <input
          id="club_name"
          name="club_name"
          required
          minLength={3}
          maxLength={120}
          placeholder="e.g. Bayside Chess Society"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1.5 block text-sm font-semibold text-cream">
          Category
        </label>
        <select id="category" name="category" defaultValue="Other" className={inputClasses}>
          {clubCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-cream">
          What will your club do?
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={10}
          maxLength={1000}
          rows={5}
          placeholder="Describe the club's purpose, activities, and who should join."
          className={inputClasses}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="meeting_days" className="mb-1.5 block text-sm font-semibold text-cream">
            Proposed meeting days
          </label>
          <input
            id="meeting_days"
            name="meeting_days"
            placeholder="e.g. Mon, Thu"
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="contact_email" className="mb-1.5 block text-sm font-semibold text-cream">
            Advisor email
          </label>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            defaultValue={defaultEmail}
            readOnly
            aria-describedby="advisor-email-help"
            className={inputClasses}
          />
          <p id="advisor-email-help" className="mt-1.5 text-xs leading-5 text-cream/60">Your signed-in teacher account will become this Club&apos;s Advisor after approval.</p>
        </div>
      </div>

      {state && !state.ok && (
        <p role="alert" className="rounded-control bg-orange/15 px-3 py-2 text-xs font-medium text-orange">
          {state.message}
        </p>
      )}
      {state && state.ok && (
        <p role="status" className="rounded-control bg-powder/15 px-3 py-2 text-xs font-medium text-powder">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center self-start rounded-[22px] bg-cream px-8 font-display text-sm font-extrabold tracking-wide text-black transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>

    </form>
  );
}
