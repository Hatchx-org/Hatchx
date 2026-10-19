"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { rememberDeviceCookie } from "@/lib/supabase/auth-session";

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts: { id: {
    initialize: (options: Record<string, unknown>) => void;
    renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
  } };
};

declare global { interface Window { google?: GoogleIdentity } }

async function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashed = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return { nonce, hashed };
}

export default function GoogleSignIn({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const router = useRouter();

  const initialize = useCallback(async () => {
    if (!clientId || !host.current || !window.google || initialized.current) return;
    initialized.current = true;
    const { nonce, hashed } = await createNonce();
    window.google.accounts.id.initialize({
      client_id: clientId,
      nonce: hashed,
      use_fedcm_for_button: true,
      callback: async ({ credential }: GoogleCredentialResponse) => {
        if (!credential) return setMessage("Google did not return a valid account. Please try again.");
        setPending(true);
        setMessage("");
        rememberDeviceCookie(false);
        try {
          const { error } = await createBrowserClient().auth.signInWithIdToken({ provider: "google", token: credential, nonce });
          if (error) throw error;
          router.push(`/auth/google/complete?next=${encodeURIComponent(next)}`);
        } catch {
          setMessage("Google sign-in could not complete. Try email sign-in or contact Support.");
          setPending(false);
        }
      },
    });
    window.google.accounts.id.renderButton(host.current, {
      type: "standard", shape: "pill", theme: "outline", text: "signin_with",
      size: "large", logo_alignment: "left", width: Math.min(400, host.current.clientWidth),
    });
  }, [clientId, next, router]);

  return <section className="mt-6" aria-label="Google sign in">
    {clientId ? <><Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => { void initialize(); }} /><div ref={host} className={`mx-auto h-10 w-full max-w-[400px] overflow-hidden rounded-[20px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#6096b4] ${pending ? "pointer-events-none opacity-60" : ""}`} /></> : <button disabled className="mx-auto flex h-10 w-full max-w-[400px] items-center justify-center rounded-[20px] border border-[#dadce0] bg-white text-sm font-medium text-[#3c4043] opacity-60">Sign in with Google</button>}
    {pending ? <p role="status" className="mt-2 text-center text-xs text-[#5f6368]">Signing in securely…</p> : null}
    {message ? <p role="alert" className="mx-auto mt-3 max-w-[400px] rounded-lg bg-orange/10 p-3 text-sm leading-5 text-orange">{message}</p> : null}
    <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#697386]" aria-hidden><span className="h-px flex-1 bg-black/10" /><span>or use email</span><span className="h-px flex-1 bg-black/10" /></div>
  </section>;
}
