"use client";

import { useActionState, useState } from "react";
import { saveSchoolNotice } from "./actions";

type Props = {
  enabled: boolean;
  text: string;
  background: string;
  textColor: string;
};

export default function NoticeSettingsForm({ enabled: initialEnabled, text: initialText, background: initialBackground, textColor: initialTextColor }: Props) {
  const [message, action, pending] = useActionState(saveSchoolNotice, "");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [text, setText] = useState(initialText);
  const [background, setBackground] = useState(initialBackground);
  const [textColor, setTextColor] = useState(initialTextColor);

  return <section id="top-school-notice" aria-labelledby="top-school-notice-heading" className="scroll-mt-24 rounded-2xl border-2 border-orange/35 bg-card p-5 shadow-sm sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-orange">School-wide message</p>
        <h2 id="top-school-notice-heading" className="mt-1 text-xl font-bold">Top notice settings</h2>
        <p className="mt-1 text-sm text-muted">Change the message, colors, and visibility together. The text remains editable when the notice is off.</p>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-full border border-line bg-content-bg px-4 py-2">
        <input name="enabled" form="school-notice-form" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} className="peer sr-only" />
        <span aria-hidden className="relative h-7 w-12 rounded-full bg-steel/45 transition peer-checked:bg-navy after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
        <span className="text-sm font-semibold">{enabled ? "Notice on" : "Notice off"}</span>
      </label>
    </div>

    <form id="school-notice-form" action={action} className="mt-5 grid gap-5" aria-busy={pending}>
      <label className="grid gap-2 text-sm font-semibold">Notice content
        <textarea name="text" value={text} onChange={(event) => setText(event.currentTarget.value)} rows={3} maxLength={4000} placeholder="Type the school-wide announcement here…" className="w-full rounded-lg border border-line bg-content-bg p-3 font-normal text-ink" />
        <span className="flex justify-between text-xs font-normal text-muted"><span>This box stays available even when the notice is switched off.</span><span>{text.length}/4000</span></span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField name="background" label="Background color" value={background} onChange={setBackground} />
        <ColorField name="text_color" label="Text and icon color" value={textColor} onChange={setTextColor} />
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-muted">Preview</p>
        <div className="flex min-h-11 items-start gap-3 rounded-xl px-4 py-3 text-sm font-semibold leading-5" style={{ backgroundColor: background, color: textColor }}>
          <span aria-hidden className="text-lg leading-5">⚠</span>
          <span className="min-w-0 break-words">{text || "Your notice preview will appear here."}</span>
          <span aria-hidden className="ml-auto text-lg leading-5">×</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-full bg-cream px-5 py-2 font-semibold text-navy disabled:opacity-50">{pending ? "Saving…" : "Save notice settings"}</button>
        <p role="status" aria-live="polite" className="text-xs text-muted">{message}</p>
      </div>
    </form>
  </section>;
}

function ColorField({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}<span className="flex items-center gap-3"><input type="color" value={value} onChange={(event) => onChange(event.currentTarget.value)} aria-label={`${label} picker`} className="h-12 w-16 cursor-pointer rounded-control border border-line bg-content-bg p-1" /><input name={name} required value={value} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={(event) => onChange(event.currentTarget.value)} className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-content-bg px-3 font-mono font-normal text-ink" /></span></label>;
}
