import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Updates & Calendar",
};

export default function AnnouncementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
