import type { Metadata } from "next";
import OpportunityCategoryPage from "../opportunity-category-page";

export const metadata: Metadata = { title: "Pre-College Programs" };
export default async function PreCollegePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const { q = "" } = await searchParams; return <OpportunityCategoryPage query={q.trim()} config={{ label: "Pre-College + Programs", heading: "Start early.\nReach higher.", description: "Experience campus life, take college-level courses, explore potential career paths, and prepare for higher education before graduating high school.", image: "/opportunities/pre-college.jpg", imageAlt: "Hand-drawn night-sky characters on a blue background", types: ["College Prep"], searchPlaceholder: "Search by program, field, or university" }} />; }
