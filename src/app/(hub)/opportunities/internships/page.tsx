import type { Metadata } from "next";
import OpportunityCategoryPage from "../opportunity-category-page";

export const metadata: Metadata = { title: "Internships" };
export default async function InternshipsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const { q = "" } = await searchParams; return <OpportunityCategoryPage query={q.trim()} config={{ label: "Internships", heading: "Start where\nyou are.", description: "Real-world experience, supportive mentors, and a first step toward the work you want to do.", image: "/opportunities/internships.jpg", imageAlt: "Hand-drawn characters and stars on a blue background", types: ["Internships"], searchPlaceholder: "Search by role, organization, or interest" }} />; }
