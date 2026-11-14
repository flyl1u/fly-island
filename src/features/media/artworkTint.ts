/**
 * The music page's accent from the cover: the average colour of its pixels, lifted until it reads
 * on the black island (the progress fill and the equalizer use it). Grey covers stay grey; a very
 * dark or very pale average is pulled to a usable lightness instead of disappearing.
 */
export function tintFromPixels(data: ArrayLike<number>): string | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha < 0.5) continue;
    // Saturated pixels count more, so a colourful cover on a white background keeps its colour.
    const max = Math.max(data[index], data[index + 1], data[index + 2]);
    const min = Math.min(data[index], data[index + 1], data[index + 2]);
    const pixelWeight = 0.05 + ((max - min) / 255) ** 2;
    red += data[index] * pixelWeight;
    green += data[index + 1] * pixelWeight;
    blue += data[index + 2] * pixelWeight;
    weight += pixelWeight;
  }
  if (weight === 0) return null;
  return readableTint(red / weight, green / weight, blue / weight);
}

/** `r, g, b` with the colour's hue and saturation, at a lightness that reads on black. */
export function readableTint(red: number, green: number, blue: number): string {
  const [hue, saturation, lightness] = toHsl(red, green, blue);
  const [r, g, b] = fromHsl(hue, Math.min(saturation, 0.8), Math.min(0.78, Math.max(0.68, lightness)));
  return `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
}

/**
 * The same accent for an island with a light background (theme.ts toneOn): `tint` (`r, g, b`, from
 * readableTint) at a lightness that reads on white instead of black.
 */
export function tintOnLight(tint: string): string {
  const [red, green, blue] = tint.split(",").map(Number);
  const [hue, saturation] = toHsl(red, green, blue);
  const [r, g, b] = fromHsl(hue, Math.min(saturation, 0.75), 0.38);
  return `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
}

function toHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [(hue * 60 + 360) % 360, saturation, lightness];
}

function fromHsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] =
    hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x]
      : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
