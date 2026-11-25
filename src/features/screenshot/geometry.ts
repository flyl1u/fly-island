import type { ScreenRect } from "./api";

/** Window rectangles arrive in desktop physical coordinates; selections use local CSS pixels. */
export function overlayWindows(windows: ScreenRect[], screen: ScreenRect, scale: number, scaleY = scale): ScreenRect[] {
  return windows.flatMap((window) => {
    const left = Math.max(window.x, screen.x);
    const top = Math.max(window.y, screen.y);
    const right = Math.min(window.x + window.width, screen.x + screen.width);
    const bottom = Math.min(window.y + window.height, screen.y + screen.height);
    if (right - left <= 24 || bottom - top <= 24) return [];
    return [fitScreenSelection({ x: (left - screen.x) / scale, y: (top - screen.y) / scaleY,
      width: (right - left) / scale, height: (bottom - top) / scaleY }, screen.width / scale, screen.height / scaleY)];
  });
}

/** Pointer coordinates stop at width-1/height-1. Snap near edges to include the final pixels. */
export function fitScreenSelection(rect: ScreenRect, width: number, height: number): ScreenRect {
  let left = Math.max(0, Math.min(width, rect.x)), top = Math.max(0, Math.min(height, rect.y));
  let right = Math.max(left, Math.min(width, rect.x + rect.width));
  let bottom = Math.max(top, Math.min(height, rect.y + rect.height));
  if (left <= 2) left = 0;
  if (top <= 2) top = 0;
  if (width - right <= 2) right = width;
  if (height - bottom <= 2) bottom = height;
  return { x: left, y: top,
    width: left === rect.x && right === rect.x + rect.width ? rect.width : right - left,
    height: top === rect.y && bottom === rect.y + rect.height ? rect.height : bottom - top };
}
