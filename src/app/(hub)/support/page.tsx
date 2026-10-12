import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerClient } from "@/lib/supabase/server";
import SupportRequestForm from "./request-form";
import { getSiteText } from "@/lib/site-content";

export const metadata: Metadata = { title: "Support" };

const serviceCards = [
  { title: "Club & Activity Support", category: "Student life", schedule: "SCHOOL DAYS · S.O. OFFICE", keywords: "club charter funding room activity", color: "bg-[#263a99]" },
  { title: "Student Counseling & Wellness", category: "Wellness", schedule: "MONDAY–FRIDAY · ROOM 147", keywords: "counselor counseling mental health wellbeing", color: "bg-[#97b4de]" },
  { title: "IT Help Desk & Device Support", category: "Tech & IT", schedule: "SCHOOL DAYS · ROOM 314", keywords: "technical technology bug account login computer device", color: "bg-[#263a99]" },
];

function searchable(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const text = await getSiteText();
  const defaultFaqs = text.support_faqs.split("\n").map(line => { const [question, ...answer] = line.split("||"); return { question: question?.trim(), answer: answer.join("||").trim() }; }).filter(faq => faq.question && faq.answer);
  const { q = "" } = await searchParams;
  const query = q.trim();
  const user = await getCurrentUser();
  const userId = user?.id;
  const supabase = isSupabaseConfigured() ? await createServerClient() : null;
  const [{ data: requests }, { data: publishedFaqs }] = await Promise.all([
    user && supabase ? supabase.from("support_requests").select("id, request_type, subject, status, created_at").eq("submitted_by", userId!).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: null }),
    supabase ? supabase.from("support_faqs").select("id,question,answer").eq("published", true).order("sort_order").order("updated_at", { ascending: false }) : Promise.resolve({ data: null }),
  ]);
  const faqs = [...(publishedFaqs ?? []), ...defaultFaqs.filter(item => !(publishedFaqs ?? []).some(published => published.question.toLocaleLowerCase() === item.question.toLocaleLowerCase()))];
  const visibleCards = query ? serviceCards.filter((card) => searchable(`${card.title} ${card.category} ${card.schedule} ${card.keywords}`, query)) : serviceCards;
  const visibleFaqs = query ? faqs.filter((faq) => searchable(`${faq.question} ${faq.answer}`, query)) : faqs;

  return (
    <div className="support-backdrop relative min-h-full overflow-hidden bg-black px-5 py-8 text-ink sm:px-8 lg:px-12">
      <div className="relative mx-auto w-full max-w-[1812px]">
        <header className="page-title-card mb-6 flex min-h-[300px] flex-col items-center justify-center text-center lg:mb-8">
          <h1 className="text-4xl font-bold sm:text-5xl lg:text-[52px]">{text.support_heading}</h1>
          <form role="search" className="mt-5 flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
            <label htmlFor="support-search" className="sr-only">Search support</label>
            <input id="support-search" name="q" defaultValue={query} placeholder="Ask a question…" className="h-12 min-w-0 flex-1 rounded-[8px] bg-[#f0ebe5] px-4 text-sm text-[#2a2829] outline-none placeholder:text-[#6f6a6b] focus:ring-2 focus:ring-[#97b4de]" />
            <button className="h-12 rounded-[8px] bg-[#263a99] px-6 text-xs font-bold text-[#f0ebe5]">SEARCH</button>
          </form>
          <p className="mt-2 text-base text-muted sm:text-xl">{text.support_intro}</p>
          {query ? <Link href="/support" className="mt-3 text-xs font-semibold text-[#97b4de] hover:underline">Clear search</Link> : null}
        </header>

        <div>
          <section aria-labelledby="support-services-title">
            <h2 id="support-services-title" className="sr-only">Support services</h2>
            {visibleCards.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleCards.map((card) => <article key={card.title} className="rounded-[12px] bg-[#dcd0be] p-[18px] text-[#2a2829]"><span className={`block size-12 rounded-[14px] ${card.color}`} aria-hidden /><h3 className="mt-3 text-base font-bold">{card.title}</h3><p className="mt-1 text-xs font-semibold text-[#263a99]">{card.category}</p><p className="mt-2 text-[11px] font-medium">{card.schedule}</p></article>)}</div> : <p className="rounded-[12px] bg-[#dcd0be] p-8 text-center text-[#2a2829]">No support service matched “{query}”.</p>}
          </section>

        </div>

        <section id="frequently-asked-questions" className="mt-8 scroll-mt-24 rounded-[20px] bg-[#dcd0be]/95 p-5 text-[#2a2829] sm:p-8" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-2xl font-bold">Frequently asked questions</h2>
          <p className="mt-2 text-sm text-[#6f6a6b]">Answers to common questions, reviewed by the Hatchx support team.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{visibleFaqs.length ? visibleFaqs.map((faq, index) => <details key={`${faq.question}-${index}`} className="group rounded-[10px] bg-[#f0ebe5] p-5"><summary className="flex cursor-pointer list-none items-center gap-3 font-semibold [&::-webkit-details-marker]:hidden"><span className="text-xs font-bold text-[#263a99]">Q{index + 1}</span><span className="flex-1">{faq.question}</span><span className="text-xl text-[#263a99] transition-transform group-open:rotate-45" aria-hidden>+</span></summary><p className="mt-3 pl-8 text-sm leading-6 text-[#6f6a6b]">{faq.answer}</p></details>) : <p className="text-sm text-[#6f6a6b]">No FAQ matched this search.</p>}</div>
        </section>

        <section id="request-support" className="mt-8 scroll-mt-24 rounded-[20px] bg-[#dcd0be]/95 p-5 text-[#2a2829] sm:p-8">
          <h2 className="text-2xl font-bold">Request support</h2>
          <p className="mt-2 text-sm text-[#6f6a6b]">{text.support_response_time}{text.support_location ? ` ${text.support_location}` : ""}</p>
          {user ? <SupportRequestForm /> : <Link href="/login?next=/support" className="mt-5 inline-flex h-11 items-center rounded-[8px] bg-[#263a99] px-6 text-xs font-bold text-[#f0ebe5]">SIGN IN TO REQUEST SUPPORT</Link>}
        </section>

        {user ? <section id="my-requests" className="mt-8 scroll-mt-24 rounded-[20px] bg-[#dcd0be]/95 p-5 text-[#2a2829] sm:p-8"><h2 className="text-2xl font-bold">My requests</h2>{requests?.length ? <ul className="mt-4 space-y-3">{requests.map((request) => <li key={request.id}><Link href={`/support/${request.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[#f0ebe5] px-5 py-4 transition hover:ring-2 hover:ring-[#97b4de]"><div><p className="font-semibold">{request.subject}</p><p className="mt-1 text-xs text-[#6f6a6b]">{request.request_type.replaceAll("_", " ")} · Open conversation →</p></div><span className="rounded-full bg-[#263a99] px-3 py-1 text-xs font-bold uppercase text-[#f0ebe5]">{request.status.replaceAll("_", " ")}</span></Link></li>)}</ul> : <p className="mt-4 text-sm text-[#6f6a6b]">You have no support requests yet.</p>}</section> : null}

        <footer className="mt-12 flex items-center gap-5 pb-2 text-[10px] font-medium text-ink"><span>SUPPORT</span><span className="h-px flex-1 bg-line" /><span className="text-muted">HATCHX</span></footer>
      </div>
    </div>
  );
}
