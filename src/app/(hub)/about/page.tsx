import type { Metadata } from "next";

export const metadata: Metadata = { title: "About", description: "Hatchx is coming soon." };

export default function AboutPage() {
  return <main className="grid min-h-[calc(100svh-8rem)] place-items-center px-5 py-20"><div className="text-center"><h1 className="font-display text-5xl font-bold tracking-[-.05em] text-ink sm:text-7xl">Coming soon</h1><p className="mt-6 text-sm text-muted sm:text-base">Built by Haoxuan Zheng &amp; Jennifer Wang</p></div></main>;
}
