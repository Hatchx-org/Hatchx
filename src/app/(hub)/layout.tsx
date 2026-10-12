import HubShell from "@/components/hub-shell";

export default function HubLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <HubShell>{children}</HubShell>;
}
