"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Recovers the faint student watermark (src/components/ContentProtection.tsx) from a leaked screenshot, entirely in the
 * browser: nothing is uploaded. The mark is drawn at ~5% opacity, so it shifts pixel values by only a few levels. A
 * high-pass filter (each pixel minus the mean of its neighbourhood) removes the page itself on flat areas, and a large
 * gain stretches what is left, so the tiled "name · email · id · date" text stands out in black on grey.
 */

const MAX_SIDE = 2400; // big enough for a full-resolution phone screenshot, small enough to stay quick

/** Box mean of `src` (w×h) with the given radius, via a summed-area table. */
function boxMean(src: Float32Array, w: number, h: number, r: number) {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

function reveal(img: HTMLImageElement, canvas: HTMLCanvasElement, gain: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  // Radius ~ a few watermark letter heights, scaled with the image: wide enough to average the letters away.
  const r = Math.max(6, Math.round(Math.max(w, h) / 160));
  const mean = boxMean(lum, w, h, r);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, 160 + (lum[i] - mean[i]) * gain));
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

export function WatermarkReveal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [gain, setGain] = useState(14);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (img && canvasRef.current) reveal(img, canvasRef.current, gain);
  }, [img, gain]);

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => {
      setError("This browser cannot open that image. Try a PNG or JPEG (on a Mac, Preview → Export converts HEIC).");
      URL.revokeObjectURL(url);
    };
    el.src = url;
  };

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "watermark-revealed.png";
    a.click();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
          Choose a screenshot
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {img ? (
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Strength
              <input
                type="range"
                min={4}
                max={40}
                value={gain}
                onChange={(e) => setGain(Number(e.target.value))}
                aria-label="Reveal strength"
              />
            </label>
            <button
              type="button"
              onClick={download}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium text-card-foreground hover:bg-muted"
            >
              Download result
            </button>
          </>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">
        The image is processed in this browser and never uploaded. Look on plain backgrounds (margins, between answer
        options) for repeated, tilted text: name · email · first 8 characters of the account id · date. The id is the
        reliable part; match it against the account list.
      </p>
      <canvas
        ref={canvasRef}
        data-testid="watermark-canvas"
        className={img ? "mt-4 h-auto max-w-full rounded-md border border-border" : "hidden"}
      />
    </div>
  );
}
