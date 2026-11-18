"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global { interface Window { turnstile?: TurnstileApi } }

export default function TurnstileChallenge({ siteKey, resetSignal, onToken }: { siteKey: string; resetSignal: number; onToken: (token: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const render = useCallback(() => {
    if (!host.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(host.current, {
      sitekey: siteKey,
      theme: "light",
      size: "flexible",
      appearance: "interaction-only",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => { onToken(null); return true; },
    });
  }, [onToken, siteKey]);

  useEffect(() => {
    if (!widgetId.current || !window.turnstile) return;
    window.turnstile.reset(widgetId.current);
    onToken(null);
  }, [onToken, resetSignal]);

  useEffect(() => () => {
    if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
  }, []);

  return <div className="mt-4" aria-label="Security check">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />
    <div ref={host} className="min-h-[65px] w-full" />
    <p className="mt-1 text-center text-[11px] text-[#697386]">Protected by Cloudflare Turnstile</p>
  </div>;
}
