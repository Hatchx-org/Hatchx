import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getAllClubs } from "@/lib/clubs";
import QuizForm from "./quiz-form";

export const metadata: Metadata = { title: "Club 101" };

export default async function ClubQuizPage() {
  const clubs = await getAllClubs();
  return <div className="mx-auto w-full max-w-6xl px-6 py-8"><PageHeader title="Club 101" subtitle="Tell us what you enjoy and when you're available. We'll rank clubs and explain every match." /><QuizForm clubs={clubs} /></div>;
}
