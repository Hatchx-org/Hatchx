"use client";

import { useActionState } from "react";
import { setApplicationStatus } from "../actions";

function StatusForm({ id, status }: { id: string; status: "approved" | "rejected" }) {
  const [state, action, pending] = useActionState(setApplicationStatus, null);
  const approve = status === "approved";
  return (
    <form action={action} onSubmit={(event) => {
      if (!approve && !window.confirm("Reject this club application?")) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" disabled={pending} className={approve
        ? "rounded-full bg-navy px-4 py-1.5 text-xs font-semibold text-cream hover:bg-navy-dark disabled:opacity-50"
        : "rounded-full border border-black/10 bg-content-bg px-4 py-1.5 text-xs font-semibold text-muted hover:border-orange hover:text-orange disabled:opacity-50"}>
        {pending ? "Saving…" : approve ? "Approve" : "Reject"}
      </button>
      {state && !state.ok && <span className="sr-only" role="alert">{state.message}</span>}
    </form>
  );
}

export default function ApplicationActions({ id }: { id: string }) {
  return <div className="flex gap-2"><StatusForm id={id} status="approved" /><StatusForm id={id} status="rejected" /></div>;
}
