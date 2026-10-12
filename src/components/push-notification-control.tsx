"use client";

import { useEffect, useState } from "react";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

export default function PushNotificationControl() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setEnabled(Boolean(subscription)));
  }, [supported]);

  async function enable() {
    if (!supported || !publicKey) return setMessage("Push notifications are not configured yet.");
    setPending(true); setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("The device could not be registered.");
      setEnabled(true); setMessage("Push notifications enabled on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Push notifications could not be enabled."); }
    finally { setPending(false); }
  }

  async function disable() {
    setPending(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setEnabled(false); setMessage("Push notifications disabled on this device.");
    } catch { setMessage("Push notifications could not be disabled."); }
    finally { setPending(false); }
  }

  if (!supported) return <p className="text-sm text-muted">Push notifications are not supported by this browser.</p>;
  return <div><button type="button" disabled={pending} onClick={enabled ? disable : enable} className="rounded-full bg-navy px-4 py-2 text-sm font-bold text-cream disabled:opacity-50">{pending ? "Updating…" : enabled ? "Disable push on this device" : "Enable push notifications"}</button>{message ? <p role="status" className="mt-2 text-xs text-muted">{message}</p> : null}</div>;
}
