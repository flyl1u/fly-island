import { useEffect, useState } from "react";
import { tintFromPixels } from "./artworkTint";

// Sampled small: the average needs a handful of pixels, not the whole cover.
const SAMPLE_SIZE = 12;

/** The cover's accent as `r, g, b` (artworkTint.ts), or null without a cover or before it loads. */
export function useArtworkTint(thumbnail: string | null) {
  const [tint, setTint] = useState<{ source: string; value: string | null } | null>(null);

  useEffect(() => {
    if (!thumbnail) return;
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
        setTint({ source: thumbnail, value: tintFromPixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data) });
      } catch {
        // A cover the canvas may not read (another origin) keeps the neutral accent.
        setTint({ source: thumbnail, value: null });
      }
    };
    image.src = thumbnail;
    return () => {
      cancelled = true;
    };
  }, [thumbnail]);

  return thumbnail && tint?.source === thumbnail ? tint.value : null;
}
