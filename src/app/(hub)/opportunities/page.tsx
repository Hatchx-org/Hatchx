import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Opportunities" };

const categories = [
  { eyebrow: "ALL", title: "Scholarships", description: "Find funding that can help pay for college and enrichment programs.", detail: "Awards & grants", href: "/opportunities/scholarships" },
  { eyebrow: "JUNIOR · SENIOR", title: "Internships", description: "Build practical experience in supportive, hands-on workplaces.", detail: "Paid & volunteer", href: "/opportunities/internships" },
  { eyebrow: "ALL GRADES", title: "Pre-College", description: "Explore college-level courses, campus programs, and future pathways.", detail: "Courses & programs", href: "/opportunities/pre-college" },
  { eyebrow: "ALL", title: "Community Service", description: "Earn service hours while contributing to the wider community.", detail: "Volunteer", href: "/opportunities/community-service" },
];

export default function OpportunitiesPage() {
  return (
    <div className="opportunity-backdrop relative min-h-full overflow-hidden bg-black px-5 py-8 text-ink sm:px-8 lg:px-12">
      <div className="relative mx-auto w-full max-w-[1812px]">
        <section className="grid items-center gap-8 py-8 lg:grid-cols-[1.25fr_0.95fr] lg:px-7 lg:py-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-powder">Opportunities</p>
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-ink sm:text-6xl">Get Involved</h1>
            <p className="mt-4 max-w-4xl text-base leading-7 text-muted sm:text-lg">Explore chances to grow, learn, and contribute. Discover open positions, upcoming projects, volunteer opportunities, and ways to collaborate with our community. Find your next step here.</p>
          </div>
          <div className="overflow-hidden rounded-[20px] border-4 border-ink bg-[#263a99]">
            <Image src="/opportunities/overview.jpg" alt="Hand-drawn stars and characters on a blue background" width={749} height={216} priority className="aspect-[749/216] w-full object-cover" />
          </div>
        </section>

        <section className="rounded-[20px] bg-[#dcd0be]/95 p-5 text-[#2a2829] sm:p-8 lg:p-10" aria-labelledby="opportunity-categories-title">
          <h2 id="opportunity-categories-title" className="text-2xl font-bold">Opportunities</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {categories.map((category) => (
              <Link key={category.href} href={category.href} className="group flex min-h-64 flex-col rounded-[10px] bg-[#f0ebe5] px-6 py-5 transition-transform hover:-translate-y-1 focus-visible:outline-[#263a99]">
                <p className="text-[11px] font-bold text-[#263a99]">{category.eyebrow}</p>
                <h3 className="mt-3 text-xl font-bold">{category.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-[#6f6a6b]">{category.description}</p>
                <div className="mt-5 flex items-center justify-between text-xs font-bold text-[#263a99]"><span>{category.detail}</span><span aria-hidden>→</span></div>
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#2a2829]/15 pt-5 text-sm font-semibold text-[#263a99]">
            <Link href="/opportunities/all?type=Student%20Discounts" className="hover:underline">Student discounts →</Link>
            <Link href="/opportunities/all" className="hover:underline">View every opportunity →</Link>
          </div>
        </section>

        <footer className="mt-12 flex items-center gap-5 pb-2 text-[10px] font-medium text-ink"><span>OPPORTUNITIES</span><span className="h-px flex-1 bg-ink" /><span className="text-muted">HATCHX</span></footer>
      </div>
    </div>
  );
}
