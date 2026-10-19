"use client";

import Image from "next/image";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { rememberDeviceCookie } from "@/lib/supabase/auth-session";

export default function GoogleSignIn({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function signIn() {
    if (pending || !isSupabaseConfigured()) return;
    setPending(true);
    setMessage("");
    // Google sign-in defaults to a browser-only session, which is safer on
    // shared school computers. Users can still choose a remembered email login.
    rememberDeviceCookie(false);
    try {
      const supabase = createBrowserClient();
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", next);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
          scopes: "openid email profile",
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setMessage("Google sign-in is unavailable. Try email sign-in or contact Support.");
        setPending(false);
      }
    } catch {
      setMessage("Unable to connect to Google. Please try again.");
      setPending(false);
    }
  }

  return <section className="mt-6" aria-label="Google sign in">
    <button
      type="button"
      onClick={signIn}
      disabled={pending || !isSupabaseConfigured()}
      className="relative mx-auto flex h-10 w-full max-w-[400px] items-center justify-center overflow-hidden rounded-[20px] border border-[#dadce0] bg-white px-10 font-['Roboto',Arial,sans-serif] text-[14px] font-medium leading-[17px] tracking-[0.25px] text-[#3c4043] transition hover:bg-[#f8faff] hover:shadow-sm focus-visible:border-[#6096b4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6096b4] disabled:cursor-wait disabled:opacity-60"
    >
      <Image src="/login/google-g.svg" alt="" width={20} height={20} className="absolute left-[13px] top-[10px]" />
      <span>{pending ? "Opening Google…" : "Sign in with Google"}</span>
    </button>
    {message ? <p role="alert" className="mx-auto mt-3 max-w-[400px] rounded-lg bg-orange/10 p-3 text-sm leading-5 text-orange">{message}</p> : null}
    <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#697386]" aria-hidden><span className="h-px flex-1 bg-black/10" /><span>or use email</span><span className="h-px flex-1 bg-black/10" /></div>
  </section>;
}
