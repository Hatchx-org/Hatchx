"use client";

import { useActionState, useState } from "react";
import { foregroundForGradient } from "@/lib/club-appearance";
import { updateClubAppearance } from "../actions";

const presets = [
  { name: "Classic", background: "#f0ebe5", accent: "#97b4de" },
  { name: "Midnight", background: "#10172f", accent: "#5f7eea" },
  { name: "Ocean", background: "#123a5a", accent: "#55b8d4" },
  { name: "Forest", background: "#173f35", accent: "#7cc89d" },
  { name: "Sunset", background: "#7a2f3a", accent: "#f78660" },
] as const;

export default function ClubAppearanceForm({ clubId, background, accent }: { clubId: string; background: string; accent: string }) {
  const [backgroundColor, setBackgroundColor] = useState(background);
  const [accentColor, setAccentColor] = useState(accent);
  const [result, action, pending] = useActionState(async (_state: { ok: boolean; message: string } | null, form: FormData) => updateClubAppearance(form), null);
  const foreground = foregroundForGradient(backgroundColor, accentColor);
  return <form action={action} className="mt-4 grid gap-4" aria-busy={pending}>
    <input type="hidden" name="club_id" value={clubId} />
    <div className="min-h-32 rounded-[18px] border border-line p-5 shadow-sm" style={{ background: `linear-gradient(135deg, ${backgroundColor}, ${accentColor})`, color: foreground }}><p className="text-xs font-bold uppercase tracking-[.16em] opacity-75">Live preview</p><p className="mt-2 font-display text-3xl font-bold uppercase">Club profile</p><span className="mt-4 inline-flex rounded-full border border-current px-3 py-1 text-xs font-bold">Recruiting</span></div>
    <fieldset><legend className="text-xs font-bold uppercase tracking-wider text-muted">Quick themes</legend><div className="mt-2 flex flex-wrap gap-2">{presets.map((preset) => <button key={preset.name} type="button" onClick={() => { setBackgroundColor(preset.background); setAccentColor(preset.accent); }} className="flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs font-semibold text-ink"><span className="size-4 rounded-full border border-black/10" style={{ background: `linear-gradient(135deg, ${preset.background} 50%, ${preset.accent} 50%)` }} />{preset.name}</button>)}</div></fieldset>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-ink">Background color<div className="mt-1 flex h-11 items-center gap-3 rounded-control border border-line bg-content-bg px-3"><input type="color" name="profile_background_color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} className="size-7 cursor-pointer border-0 bg-transparent p-0" /><code className="text-xs uppercase">{backgroundColor}</code></div></label><label className="text-sm font-medium text-ink">Accent color<div className="mt-1 flex h-11 items-center gap-3 rounded-control border border-line bg-content-bg px-3"><input type="color" name="profile_accent_color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="size-7 cursor-pointer border-0 bg-transparent p-0" /><code className="text-xs uppercase">{accentColor}</code></div></label></div>
    <button disabled={pending} className="h-11 rounded-full bg-navy px-5 font-bold text-cream disabled:opacity-50">{pending ? "Saving…" : "Save profile background"}</button>
    {result ? <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-navy" : "text-orange"}`}>{result.message}</p> : null}
  </form>;
}
