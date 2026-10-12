"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clubMediaPermissionOptions } from "@/lib/club-media";
import { uploadClubImage } from "../actions";

type CropRatio = "landscape" | "square" | "portrait";
type GeneratedImage = { file: File; width: number; height: number };
const safeUploadBytes = 3.5 * 1024 * 1024;
const ratios: Record<CropRatio, { label: string; value: number }> = {
  landscape: { label: "Landscape 4:3", value: 4 / 3 },
  square: { label: "Square 1:1", value: 1 },
  portrait: { label: "Portrait 4:5", value: 4 / 5 },
};
const field = "h-10 w-full rounded-control border border-line bg-content-bg px-3 text-sm text-ink";

export default function ClubImageUploader({ clubId }: { clubId: string }) {
  const router = useRouter();
  const [source, setSource] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [ratio, setRatio] = useState<CropRatio>("landscape");
  const [zoom, setZoom] = useState(1.1);
  const [positionX, setPositionX] = useState(0);
  const [positionY, setPositionY] = useState(0);
  const [prepared, setPrepared] = useState<{ large: GeneratedImage; medium: GeneratedImage; thumbnail: GeneratedImage } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !sourceUrl) return;
    let cancelled = false;
    loadImage(sourceUrl).then((image) => {
      if (cancelled) return;
      drawCrop(canvas, image, ratios[ratio].value, zoom, positionX, positionY, 900);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [sourceUrl, ratio, zoom, positionX, positionY]);

  function chooseSource(file?: File) {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setPrepared(null); setResult(null);
    if (!file) { setSource(null); setSourceUrl(""); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      setSource(null); setSourceUrl(""); setResult({ ok: false, message: "Choose a JPG, PNG, or WebP image up to 20 MB. Convert HEIC photos before uploading." }); return;
    }
    setSource(file); setSourceUrl(URL.createObjectURL(file));
  }

  function changed<T>(setter: (value: T) => void, value: T) { setter(value); setPrepared(null); }

  async function prepare() {
    if (!sourceUrl || !source) return null;
    setProcessing(true); setResult(null);
    try {
      const image = await loadImage(sourceUrl);
      const outputs = await generateVariants(image, ratios[ratio].value, zoom, positionX, positionY);
      const next = { large: outputs[0], medium: outputs[1], thumbnail: outputs[2] };
      setPrepared(next);
      const total = outputs.reduce((sum, output) => sum + output.file.size, 0);
      setResult({ ok: true, message: `Ready: three optimized WebP sizes (${formatBytes(total)} total).` });
      return next;
    } catch {
      setResult({ ok: false, message: "This image could not be processed. Try a JPG, PNG, or WebP file." });
      return null;
    } finally { setProcessing(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true); setResult(null);
    try {
      const images = prepared ?? await prepare();
      if (!images) return;
      const form = new FormData(formElement);
      form.set("image_large", images.large.file);
      form.set("image_medium", images.medium.file);
      form.set("image_thumbnail", images.thumbnail.file);
      form.set("image_width", String(images.large.width)); form.set("image_height", String(images.large.height));
      const response = await uploadClubImage(form);
      setResult(response);
      if (response.ok) { formElement.reset(); setSource(null); setSourceUrl(""); setPrepared(null); setRatio("landscape"); setZoom(1.1); setPositionX(0); setPositionY(0); router.refresh(); }
    } catch { setResult({ ok: false, message: "Upload could not complete. Refresh before trying again." }); }
    finally { setPending(false); }
  }

  return <form onSubmit={submit} className="mt-4 grid gap-4" aria-busy={pending || processing}>
    <input type="hidden" name="club_id" value={clubId} />
    <label className="text-sm font-semibold text-cream">Choose a photo<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => chooseSource(event.currentTarget.files?.[0])} className="mt-2 block w-full rounded-control border border-line bg-black/15 p-2 text-sm text-cream file:mr-3 file:rounded-full file:border-0 file:bg-cream file:px-4 file:py-2 file:font-bold file:text-navy" /></label>
    {sourceUrl ? <div className="grid gap-4 rounded-xl border border-white/15 bg-black/15 p-4">
      <canvas ref={previewRef} role="img" aria-label="Exact crop preview" className="mx-auto h-auto w-full max-w-md rounded-lg bg-black/30" />
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-cream/75">Crop shape<select value={ratio} onChange={(event) => changed(setRatio, event.currentTarget.value as CropRatio)} className={`${field} mt-1`}>{Object.entries(ratios).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label><label className="text-xs font-semibold text-cream/75">Zoom · {zoom.toFixed(2)}×<input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => changed(setZoom, Number(event.currentTarget.value))} className="mt-3 w-full accent-[#fcf1dd]" /></label><CropFocusControl axis="Horizontal" value={positionX} onChange={(value) => changed(setPositionX, value)} /><CropFocusControl axis="Vertical" value={positionY} onChange={(value) => changed(setPositionY, value)} /></div>
      <p className="text-xs leading-5 text-cream/60">Use the focus buttons for exact left/center/right or top/middle/bottom placement. Increase zoom when you need more room to reposition the photo.</p>
      <button type="button" onClick={prepare} disabled={processing} className="justify-self-start rounded-full border border-cream px-4 py-2 text-xs font-bold text-cream disabled:opacity-50">{processing ? "Optimizing…" : prepared ? "Rebuild image sizes" : "Prepare cropped image"}</button>
    </div> : null}
    <input name="title" maxLength={120} placeholder="Photo title (optional)" className={field} />
    <label className="grid gap-1 text-xs font-semibold text-cream/75">Alternative text<input name="alt_text" required minLength={10} maxLength={240} placeholder="Describe the people, activity, and setting" className={field} /><span className="font-normal">Required for public and cover images. Avoid labels such as “photo” or “image.”</span></label>
    <label className="grid gap-1 text-xs font-semibold text-cream/75">Sharing permission<select name="permission_basis" required defaultValue="" className={field}><option value="" disabled>Choose the permission record</option>{clubMediaPermissionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <textarea name="permission_note" maxLength={500} rows={2} placeholder="Permission note, approver, or context (optional)" className={`${field} h-auto py-2`} />
    <label className="text-sm text-cream">Initial placement<select name="visibility" defaultValue="private" className={`${field} mt-1`}><option value="private">Private library</option><option value="gallery">Public gallery</option></select></label>
    <label className="flex items-center gap-2 text-sm text-cream"><input type="checkbox" name="is_cover" /> Set as Club cover</label>
    <label className="flex items-start gap-2 rounded-control border border-white/10 p-3 text-xs leading-5 text-cream/75"><input type="checkbox" name="permission_confirmed" required className="mt-1" /> I confirm this permission record is accurate and the image may be stored for Club use.</label>
    <p className="text-xs leading-5 text-cream/55">The original source stays on this device. Hatchx uploads three cropped, compressed WebP versions for faster pages.</p>
    <button disabled={pending || processing || !source} className="h-10 rounded-full bg-cream px-5 font-bold text-black disabled:opacity-50">{pending ? "Preparing and uploading…" : prepared ? "Upload optimized photo" : "Prepare and upload photo"}</button>
    {result ? <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-cream" : "text-orange"}`}>{result.message}</p> : null}
  </form>;
}

function loadImage(url: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

async function generateVariants(image: HTMLImageElement, aspect: number, zoom: number, x: number, y: number) {
  for (const quality of [.84, .75, .66]) {
    const outputs = await Promise.all([
      renderVariant(image, aspect, zoom, x, y, 1600, "large", quality),
      renderVariant(image, aspect, zoom, x, y, 960, "medium", quality),
      renderVariant(image, aspect, zoom, x, y, 480, "thumbnail", Math.min(.78, quality)),
    ]);
    if (outputs.reduce((sum, output) => sum + output.file.size, 0) <= safeUploadBytes) return outputs;
  }
  throw new Error("Optimized files exceed the safe upload size");
}

async function renderVariant(image: HTMLImageElement, aspect: number, zoom: number, x: number, y: number, maxDimension: number, name: string, quality: number): Promise<GeneratedImage> {
  const canvas = document.createElement("canvas");
  const { width, height } = drawCrop(canvas, image, aspect, zoom, x, y, maxDimension);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Compression failed")), "image/webp", quality));
  return { file: new File([blob], `${name}.webp`, { type: "image/webp" }), width, height };
}

function CropFocusControl({ axis, value, onChange }: { axis: "Horizontal" | "Vertical"; value: number; onChange: (value: number) => void }) {
  const labels = axis === "Horizontal" ? ["Left", "Center", "Right"] : ["Top", "Middle", "Bottom"];
  return <fieldset className="grid gap-2"><legend className="text-xs font-semibold text-cream/75">{axis} focus · {value}</legend><input aria-label={`${axis} crop focus`} type="range" min="-100" max="100" value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} className="w-full accent-[#fcf1dd]" /><div className="grid grid-cols-3 gap-1">{[-100, 0, 100].map((position, index) => <button key={position} type="button" onClick={() => onChange(position)} aria-pressed={value === position} className="rounded-full border border-white/20 px-2 py-1 text-[11px] font-semibold text-cream aria-pressed:bg-cream aria-pressed:text-navy">{labels[index]}</button>)}</div></fieldset>;
}

function drawCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, aspect: number, zoom: number, x: number, y: number, maxDimension: number) {
  const sourceAspect = image.naturalWidth / image.naturalHeight;
  let cropWidth = sourceAspect > aspect ? image.naturalHeight * aspect : image.naturalWidth;
  let cropHeight = cropWidth / aspect;
  cropWidth /= zoom; cropHeight /= zoom;
  const sourceX = (image.naturalWidth - cropWidth) * ((x + 100) / 200);
  const sourceY = (image.naturalHeight - cropHeight) * ((y + 100) / 200);
  const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
  const width = Math.max(1, Math.round(cropWidth * scale));
  const height = Math.max(1, Math.round(cropHeight * scale));
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas unavailable");
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
  return { width, height };
}
