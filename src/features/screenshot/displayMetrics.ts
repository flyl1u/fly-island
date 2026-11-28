import type { ScreenRect } from "./api";

export type ScreenshotViewport = { width: number; height: number; dpr: number };

/** Native DPI and WebView layout may arrive on different turns when switching monitors. */
export function viewportMatchesDisplay(region: ScreenRect, dpi: number, viewport: ScreenshotViewport): boolean {
  return viewport.width > 0 && viewport.height > 0 && Math.abs(viewport.dpr - dpi) < 0.001
    && Math.abs(viewport.width * dpi - region.width) <= 2
    && Math.abs(viewport.height * dpi - region.height) <= 2;
}

export async function waitForScreenshotViewport(
  region: ScreenRect, dpi: number, read: () => ScreenshotViewport,
): Promise<ScreenshotViewport | null> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const viewport = read();
    if (viewportMatchesDisplay(region, dpi, viewport)) return viewport;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  return null;
}
