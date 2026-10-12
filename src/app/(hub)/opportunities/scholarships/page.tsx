import type { Metadata } from "next";
import OpportunityCategoryPage from "../opportunity-category-page";

export const metadata: Metadata = { title: "Scholarships" };
export default async function ScholarshipsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const { q = "" } = await searchParams; return <OpportunityCategoryPage query={q.trim()} config={{ label: "Scholarships", heading: "Apply today.\nAchieve more.", description: "Discover funding opportunities to support your education. Browse available scholarships, check eligibility criteria, and find the financial backing you need to succeed.", image: "/opportunities/scholarships.jpg", imageAlt: "Hand-drawn animal characters on a blue background", types: ["Scholarships"], searchPlaceholder: "Search by subject, amount, or deadline" }} />; }
