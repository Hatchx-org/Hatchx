import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getSiteText } from "@/lib/site-content";

export const metadata = { title: "Help Guide — Support" };

export default async function ManualPage() {
  const [text, user] = await Promise.all([getSiteText(), getCurrentUser()]);
  return <div className="mx-auto w-full max-w-5xl px-6 py-8">
    <PageHeader eyebrow="Support" title="Help Guide" subtitle="Practical instructions for students, Club leaders, Advisors, and administrators." actions={<div className="flex gap-2"><Link href="/support" className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink">Support Home</Link>{user?.role === "admin" ? <Link href="/manage/site" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-cream">Edit this guide</Link> : null}</div>} />
    <article className="rounded-card border border-line bg-card p-6 shadow-sm sm:p-8">
      <div className="whitespace-pre-wrap text-sm leading-7 text-ink">{text.manual_content}</div>
    </article>
  </div>;
}
