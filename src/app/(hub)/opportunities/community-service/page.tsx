import type { Metadata } from "next";
import OpportunityCategoryPage from "../opportunity-category-page";

export const metadata: Metadata = { title: "Community Service" };
export default async function CommunityServicePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { const { q = "" } = await searchParams; return <OpportunityCategoryPage query={q.trim()} config={{ label: "Community Service", heading: "Serve today.\nShape tomorrow.", description: "Make a meaningful local impact through volunteer projects and civic initiatives. Build leadership skills, connect with your community, and create positive change through service.", image: "/opportunities/community-service.jpg", imageAlt: "Hand-drawn stars on a blue background", types: ["Community Service"], searchPlaceholder: "Search by cause, organization, or location" }} />; }
