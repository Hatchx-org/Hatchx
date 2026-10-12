import { hasAnyTeacherPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await hasAnyTeacherPermission())) redirect("/");
  return <div className="theme-light min-h-full bg-content-bg">{children}</div>;
}
