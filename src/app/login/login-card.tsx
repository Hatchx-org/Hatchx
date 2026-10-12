"use client";

import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/navigation";
import EmailAccount from "./email-account";
import { LogoMark } from "@/components/icons";

function LoginBrand() {
  return <div className="login-brand flex items-center gap-3"><LogoMark className="h-11 w-11 sm:h-12 sm:w-12" variant="light" /><p className="text-2xl font-bold text-[#4285f4] sm:text-3xl">Hatchx</p></div>;
}

export function LoginCardSkeleton() {
  return (
    <div>
      <LoginBrand />
      <h1 className="mt-6 text-4xl font-bold text-black sm:text-5xl">Welcome</h1>
      <p className="mt-3 text-sm text-[#5f6368]">
        Sign in with your NYC student account to get started.
      </p>
      <div className="mt-7 h-11 w-full animate-pulse rounded-full bg-[#c0dbea]" />
    </div>
  );
}

export default function LoginCard() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const error = searchParams.get("error");
  return (
    <div>
      <LoginBrand />
      <p className="login-welcome mt-3 text-xs font-bold uppercase tracking-[0.2em] text-[#5269bd]">Bayside starts here</p>
      <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] text-black sm:text-5xl">Welcome</h1>
      <p className="login-description mt-3 text-sm leading-6 text-[#5f6368]">Sign in with your school email, or create your Hatchx account.</p>

      {error === "auth" && (
        <p className="mt-4 rounded-light bg-orange/10 px-3 py-2 text-xs font-medium text-orange">
          Sign-in didn&apos;t complete. Please try again.
        </p>
      )}
      {error === "domain" && (
        <p className="mt-4 rounded-light bg-orange/10 px-3 py-2 text-xs font-medium text-orange" role="alert">
          This account is not from an approved school domain.
        </p>
      )}
      {error === "recovery" && (
        <p className="mt-4 rounded-light bg-orange/10 px-3 py-2 text-xs font-medium text-orange" role="alert">
          This password reset link is invalid, expired, or was opened in a different browser. Request a new link below.
        </p>
      )}
      <EmailAccount next={next} recovery={searchParams.get("mode") === "recovery"} />
      <p className="login-domain-note mt-4 text-center text-xs leading-5 text-[#5f6368]">Use your school account. On shared devices, leave “Remember this device” unchecked.</p>
    </div>
  );
}
