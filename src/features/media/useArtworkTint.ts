import { useEffect, useState } from "react";
import { tintFromPixels } from "./artworkTint";

// Sampled small: the average needs a handful of pixels, not the whole cover.
const SAMPLE_SIZE = 12;
// The last few covers' accents. The music page mounts again on every visit; without these it
// found its accent a few frames in, repainting itself while the island was still resizing.
const recent = new Map<string, string | null>();
const RECENT_LIMIT = 8;

function remember(source: string, value: string | null) {
  recent.delete(source);
  recent.set(source, value);
  if (recent.size > RECENT_LIMIT) recent.delete(recent.keys().next().value ?? source);
}

/** The cover's accent as `r, g, b` (artworkTint.ts), or null without a cover or before it loads. */
export function useArtworkTint(thumbnail: string | null) {
  const [tint, setTint] = useState<{ source: string; value: string | null } | null>(null);

  useEffect(() => {
    if (!thumbnail || recent.has(thumbnail)) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const value = tintFromPixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
        remember(thumbnail, value);
        setTint({ source: thumbnail, value });
      } catch {
        // A cover the canvas may not read (another origin) keeps the neutral accent.
        remember(thumbnail, null);
        setTint({ source: thumbnail, value: null });
      }
    };
    image.src = thumbnail;
    return () => {
      cancelled = true;
    };
  }, [thumbnail]);

  if (!thumbnail) return null;
  return tint?.source === thumbnail ? tint.value : recent.get(thumbnail) ?? null;
}
