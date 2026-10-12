import type { Metadata } from "next";
import { Geist, Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import PwaRegistration from "@/components/pwa-registration";
import ProductAnalytics from "@/components/product-analytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Hatchx", template: "%s | Hatchx" },
  description:
    "Hatchx — your one-stop home for announcements, clubs, events, and opportunities at Bayside High School.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Hatchx", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/brand-logo-light.png", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/brand-logo-dark.png", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/brand-logo-light.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('bayside-theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='dark'}})()` }} />
      </head>
      <body className="h-full bg-content-bg text-ink">
        {children}
        <PwaRegistration />
        <ProductAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
