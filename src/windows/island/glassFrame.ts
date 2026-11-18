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
