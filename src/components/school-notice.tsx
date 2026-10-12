"use client";

import { useEffect, useState, type CSSProperties } from "react";

const colorPattern = /^#[0-9a-f]{6}$/i;

function safeColor(value: string, fallback: string) {
  return colorPattern.test(value.trim()) ? value.trim() : fallback;
}

function noticeKey(message: string, backgroundColor: string, textColor: string) {
  let hash = 0;
  const value = `${message}|${backgroundColor}|${textColor}`;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `bayside-school-notice-${Math.abs(hash)}`;
}

export default function SchoolNotice({
  enabled,
  message,
  backgroundColor,
  textColor,
}: {
  enabled: boolean;
  message: string;
  backgroundColor: string;
  textColor: string;
}) {
  const [visible, setVisible] = useState(false);
  const storageKey = noticeKey(message, backgroundColor, textColor);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(window.localStorage.getItem(storageKey) !== "dismissed");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  if (!enabled || !message.trim() || !visible) return null;

  const style = {
    "--notice-background": safeColor(backgroundColor, "#ff8500"),
    "--notice-foreground": safeColor(textColor, "#101010"),
  } as CSSProperties;

  function dismiss() {
    window.localStorage.setItem(storageKey, "dismissed");
    setVisible(false);
  }

  return (
    <div className="school-notice-shell" style={style}>
      <aside className="school-notice" role="status" aria-label="Important school notice">
        <svg className="school-notice-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5 21 20H3L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
        <p>{message}</p>
        <button type="button" onClick={dismiss} aria-label="Dismiss school notice" title="Dismiss notice">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </aside>
    </div>
  );
}
