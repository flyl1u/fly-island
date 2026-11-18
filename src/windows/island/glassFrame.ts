/** Bytes before the pixels in a frame from src-tauri/src/island/glass_capture.rs. */
const HEADER = 24;

/** One frame of the live backdrop: where it sits on the window (physical px) and its pixels. */
export type GlassFrame = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  /** RGBA rows, `width × height`. */
  pixels: Uint8ClampedArray;
};

/** null for an empty message (the capture paused) or one too short for its own size. */
export function parseGlassFrame(data: ArrayBuffer | ArrayLike<number>): GlassFrame | null {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);
  if (bytes.byteLength < HEADER) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER);
  const width = view.getUint32(16, true);
  const height = view.getUint32(20, true);
  if (width === 0 || height === 0 || bytes.byteLength < HEADER + width * height * 4) return null;
  return {
    left: view.getInt32(0, true),
    top: view.getInt32(4, true),
    right: view.getInt32(8, true),
    bottom: view.getInt32(12, true),
    width,
    height,
    pixels: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset + HEADER, width * height * 4),
  };
}

/** The frame's place on the window in CSS px (IslandGlass.css .island__glass-backdrop). */
export function glassFramePlacement(frame: GlassFrame, scale: number) {
  const ratio = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const px = (value: number) => `${Math.round((value / ratio) * 100) / 100}px`;
  return {
    "--glass-frame-x": px(frame.left),
    "--glass-frame-y": px(frame.top),
    "--glass-frame-width": px(frame.right - frame.left),
    "--glass-frame-height": px(frame.bottom - frame.top),
  };
}

/**
 * How bright the backdrop is behind the island's middle (0 dark – 1 white), weighted towards its
 * bright parts: text has to stay readable over the brightest thing behind it, not the average.
 * Every 4th pixel of the middle 70% across is enough; the frame is a quarter of screen size.
 */
export function backdropLuma(frame: GlassFrame) {
  const { width, height, pixels } = frame;
  const from = Math.floor(width * 0.15);
  const to = Math.ceil(width * 0.85);
  const buckets = new Array<number>(17).fill(0);
  let count = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = from; x < to; x += 4) {
      const at = (y * width + x) * 4;
      const luma = (0.2126 * pixels[at] + 0.7152 * pixels[at + 1] + 0.0722 * pixels[at + 2]) / 255;
      buckets[Math.round(luma * 16)] += 1;
      count += 1;
    }
  }
  if (count === 0) return 0;
  let mean = 0;
  let seen = 0;
  let p90 = -1;
  for (let index = 0; index < buckets.length; index += 1) {
    mean += (index / 16) * buckets[index];
    seen += buckets[index];
    if (p90 < 0 && seen >= count * 0.9) p90 = index / 16;
  }
  return Math.round(((mean / count + p90) / 2) * 20) / 20;
}
