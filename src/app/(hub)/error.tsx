"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/client-error-reporting";

export default function HubError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Page failed to load", error); reportClientError(error, "hub-error-boundary"); }, [error]);
  return <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-5 py-12"><div className="w-full rounded-card border border-line bg-card p-8 text-center"><h1 className="text-2xl font-bold text-ink">This page could not load</h1><p className="mt-3 text-sm leading-6 text-muted">Your work has not been intentionally discarded. Check your connection and try again.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={reset} className="rounded-full bg-navy px-5 py-2 text-sm font-bold text-cream">Try again</button><Link href="/support#technical-support" className="rounded-full border border-line px-5 py-2 text-sm font-bold text-ink">Get help</Link></div></div></main>;
}
