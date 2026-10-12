"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/supabase/types";

export default function RealtimeNotifications({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const db = createBrowserClient();
    const channel = db.channel(`notifications:${userId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      async (payload) => {
        const notification = payload.new as NotificationRow;
        router.refresh();
        if (notification.kind === "emergency_announcement" && "Notification" in window && Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.ready;
          await registration?.showNotification(notification.title, {
            body: notification.body,
            icon: "/brand-logo-light.png",
            badge: "/icon.png",
            tag: notification.id,
            requireInteraction: true,
            data: { url: notification.href ?? "/notifications" },
          });
        }
      },
    ).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [router, userId]);
  return null;
}
