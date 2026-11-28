export function imageScaleSize(width: number, height: number, percent: number) {
  const maximum = Math.min(4, 16384 / width, 16384 / height, Math.sqrt(64_000_000 / (width * height)));
  const minimum = Math.max(1 / width, 1 / height, .05);
  const scale = Math.max(minimum, Math.min(maximum, percent / 100));
  const rounded = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  if (rounded.width * rounded.height > 64_000_000) {
    rounded.width = Math.max(1, Math.floor(width * scale)); rounded.height = Math.max(1, Math.floor(height * scale));
  }
  return { ...rounded, percent: scale * 100 };
}
