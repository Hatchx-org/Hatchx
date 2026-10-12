"use client";

import { useState } from "react";

const input = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

export default function AttendanceStartInput() {
  const [value, setValue] = useState("");
  return <label className="text-sm text-cream sm:col-span-2">Starts at (optional)
    <input type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} className={`${input} mt-1`} />
    <input type="hidden" name="starts_at" value={value ? new Date(value).toISOString() : ""} />
    <span className="mt-1 block text-xs text-cream/55">Leave blank to open immediately, or choose a future time to prepare the QR code in advance.</span>
  </label>;
}
