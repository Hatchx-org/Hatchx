import Link from "next/link";
import { LogoMark } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#08101f] px-6 py-20 text-center text-[#fff4df]">
      <LogoMark className="h-20 w-20" variant="dark" />
      <h1 className="mt-6 font-display text-4xl font-bold uppercase tracking-wide text-[#fff4df] sm:text-5xl">
        Lost at sea
      </h1>
      <p className="mt-3 max-w-md text-base leading-7 text-[#d5deed]">
        This page drifted off the map. It may have been moved, renamed, or
        never existed — let&apos;s get you back to shore.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-[22px] bg-[#fff4df] px-7 font-display text-sm font-extrabold tracking-wide text-[#08101f] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Back to Home
        </Link>
        <Link
          href="/clubs"
          className="inline-flex h-11 items-center justify-center rounded-[22px] border border-[#b9c9e3] px-7 text-sm font-bold text-[#fff4df] transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Browse Clubs
        </Link>
        <Link
          href="/support"
          className="inline-flex h-11 items-center justify-center rounded-[22px] border border-[#b9c9e3] px-7 text-sm font-bold text-[#fff4df] transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Get Help
        </Link>
      </div>
    </div>
  );
}
