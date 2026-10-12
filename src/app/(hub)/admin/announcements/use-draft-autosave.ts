"use client";

import { useEffect, useRef, useState } from "react";
import { saveAnnouncementDraft } from "../actions";

export type DraftFields = { title: string; tag: string; body: string; publishAt: string; priority: string; pinnedUntil: string; expiresAt: string; audienceType: string; audienceGrades: number[]; audienceClubIds: string[]; notifyInApp: boolean; notifyEmail: boolean };

export function useDraftAutosave(key: string, fields: DraftFields, disabled = false) {
  const [status, setStatus] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (disabled) return;
    if (first.current) { first.current = false; return; }
    setStatus("Saving draft…");
    const timer = window.setTimeout(async () => {
      const result = await saveAnnouncementDraft({ key, ...fields, publishAt: fields.publishAt ? new Date(fields.publishAt).toISOString() : "", pinnedUntil: fields.pinnedUntil ? new Date(fields.pinnedUntil).toISOString() : "", expiresAt: fields.expiresAt ? new Date(fields.expiresAt).toISOString() : "" });
      setStatus(result.message);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [key, fields, disabled]);
  return status;
}

export function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
