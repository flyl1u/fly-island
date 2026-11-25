import type { ScreenRect } from "./api";

/** Window rectangles arrive in desktop physical coordinates; selections use local CSS pixels. */
export function overlayWindows(windows: ScreenRect[], screen: ScreenRect, scale: number): ScreenRect[] {
  return windows.flatMap((window) => {
    const left = Math.max(window.x, screen.x);
    const top = Math.max(window.y, screen.y);
    const right = Math.min(window.x + window.width, screen.x + screen.width);
    const bottom = Math.min(window.y + window.height, screen.y + screen.height);
    if (right - left <= 24 || bottom - top <= 24) return [];
    return [{ x: (left - screen.x) / scale, y: (top - screen.y) / scale,
      width: (right - left) / scale, height: (bottom - top) / scale }];
  });
}
