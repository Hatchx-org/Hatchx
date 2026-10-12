"use client";
import { useActionState, type ReactNode } from "react";
import { manageCustomRole } from "./actions";
export default function RoleActionForm({ children }: { children: ReactNode }) {
  const [message, action, pending] = useActionState(manageCustomRole, "");
  return <form action={action} className="grid gap-3 rounded-xl border border-line bg-card p-5"><fieldset disabled={pending} className="grid gap-3">{children}</fieldset>{message && <p role="status" className="text-sm">{message}</p>}</form>;
}
