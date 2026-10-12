"use client";

import { useFormStatus } from "react-dom";

export default function PendingSubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
    {pending ? pendingLabel : children}
  </button>;
}
