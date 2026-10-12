import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import LoginCard, { LoginCardSkeleton } from "./login-card";
import { LogoMark } from "@/components/icons";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <div className="login-page login-gradient relative z-50 min-h-screen min-h-dvh w-full overflow-hidden px-4 py-4 sm:px-7 sm:py-6 lg:px-10">
      <div className="login-figma-stage pointer-events-none absolute inset-0" aria-hidden>
        <div className="login-figma-orb">
          <Image src="/login/orb-shine.svg" alt="" width={450} height={450} priority className="login-figma-shine" />
          <Image src="/login/orb-core.svg" alt="" width={450} height={450} priority className="login-figma-core" />
        </div>
        <Image src="/login/orb-reflection.svg" alt="" width={250} height={250} priority className="login-figma-reflection" />
      </div>
      <nav className="relative z-10 mx-auto flex w-full max-w-[1800px] items-center justify-between text-[#f7f8f0]">
        <Link href="/" aria-label="Hatchx home" className="flex items-center gap-3 text-sm font-bold tracking-wide"><LogoMark className="h-12 w-12" variant="dark" /><span className="login-nav-wordmark">HATCHX</span></Link>
        <Link href="/support#technical-support" className="rounded-full border border-white/30 px-5 py-2 text-xs font-semibold hover:bg-white/10">NEED HELP?</Link>
      </nav>
      <main className="relative z-10 mx-auto grid min-h-[calc(100svh-88px)] w-full max-w-[1500px] items-center gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(410px,530px)] lg:gap-12 lg:py-10">
        <section className="login-intro-copy relative hidden max-w-2xl text-[#f7f8f0] lg:block">
          <div className="relative z-10">
            <p className="text-xs font-bold tracking-[0.3em] text-[#b9d9ff]">ONE SCHOOL · ONE HUB</p>
            <h1 className="mt-5 text-[clamp(3.2rem,6vw,5.8rem)] font-bold leading-[0.9] tracking-[-0.06em]">Find your place<br />at Bayside.</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-white/72 xl:text-lg xl:leading-8">Your clubs, school updates, events, and opportunities move with you—all in one clear, connected space.</p>
            <ol className="mt-8 flex flex-wrap gap-2.5 text-[10px] font-bold tracking-wider" aria-label="Sign-in benefits">
              <li className="rounded-full bg-white px-4 py-2 text-[#141d40]">DISCOVER</li>
              <li className="rounded-full border border-white/25 bg-white/[.04] px-4 py-2">CONNECT</li>
              <li className="rounded-full border border-white/25 bg-white/[.04] px-4 py-2">PARTICIPATE</li>
            </ol>
          </div>
        </section>
        <section className="login-intro-card relative mx-auto w-full max-w-[560px] rounded-[28px] border border-white/70 bg-[#f7f8f0]/95 px-5 py-7 shadow-[0_28px_90px_rgba(3,8,28,0.38)] backdrop-blur-xl sm:px-9 sm:py-9 lg:mx-0 lg:justify-self-end">
          <Suspense fallback={<LoginCardSkeleton />}><LoginCard /></Suspense>
          <p className="login-card-support mt-5 text-center text-xs text-[#5f6368]">Need help? <Link href="/support#technical-support" className="font-semibold text-navy underline-offset-2 hover:underline">Visit Technical Support</Link></p>
          <nav aria-label="Account policies" className="login-card-policies mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-navy"><Link href="/privacy" className="underline">Privacy Policy</Link><Link href="/terms" className="underline">Terms of Use</Link></nav>
        </section>
      </main>
    </div>
  );
}
