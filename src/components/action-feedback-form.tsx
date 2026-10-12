"use client";

import { useActionState, type ReactNode } from "react";
import { MAX_IMAGE_UPLOAD_BYTES } from "@/lib/upload-limits";

export type ActionResult = { ok: boolean; message: string };

/** Every management form exposes pending, rejection and success without a reload. */
export default function ActionFeedbackForm({ action, children, className }: {
  action: (form: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
}) {
  const [result, submit, pending] = useActionState(async (_state: ActionResult | null, form: FormData) => {
    if ([...form.values()].some(value => value instanceof File && value.size > MAX_IMAGE_UPLOAD_BYTES)) {
      return { ok: false, message: "Choose an image up to 4 MB. Larger files must be resized before uploading." };
    }
    try { return await action(form); }
    catch { return { ok: false, message: "The request could not complete. Refresh to check its status before trying again." }; }
  }, null);
  return <form action={submit} className={className} aria-busy={pending}>
    <fieldset disabled={pending} className="contents">{children}</fieldset>
    {pending && <p role="status" className="text-xs">Saving…</p>}
    {result && <p role={result.ok ? "status" : "alert"} className="basis-full text-sm">{result.message}</p>}
  </form>;
}
