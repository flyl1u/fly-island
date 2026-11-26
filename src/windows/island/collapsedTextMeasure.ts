import type { MeasureCollapsedText } from "./collapsedWidth";

/**
 * Measures text as the collapsed bar draws it, on a canvas, so nothing depends on the width the
 * bar has now. Keep sizes and weights in step with IslandCollapsedBar.css and the pixel font's
 * overrides in IslandApp.css.
 */
export function createCollapsedTextMeasure(family: string, pixelFont: boolean, fontScale: number): MeasureCollapsedText {
  const context = document.createElement("canvas").getContext("2d");
  const fonts = {
    label: `${pixelFont ? 400 : 600} ${(pixelFont ? 14 : 13) * fontScale}px ${family}`,
    brand: `${pixelFont ? 400 : 700} ${(pixelFont ? 14 : 15) * fontScale}px ${family}`,
  };
  return (text, role) => {
    if (!context) return 0;
    context.font = fonts[role];
    return context.measureText(text).width;
  };
}
