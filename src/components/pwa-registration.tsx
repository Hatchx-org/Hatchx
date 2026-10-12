"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(register, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(register, 1000);
    return () => clearTimeout(id);
  }, []);
  return null;
}
