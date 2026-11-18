/** The monitor a backdrop picture covers, in physical screen px (api.ts IslandBackdrop). */
export type BackdropMonitor = { left: number; top: number; width: number; height: number };

/**
 * Where the blurred wallpaper sits on the island window (IslandGlass.css .island__glass-backdrop):
 * the monitor's picture, sized in CSS px and shifted so the part under the window shows. The
 * window's position is physical px; `scale` is its DPI scale.
 */
export function backdropPlacement(monitor: BackdropMonitor, windowPosition: { x: number; y: number }, scale: number) {
  const ratio = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const px = (value: number) => `${Math.round((value / ratio) * 100) / 100}px`;
  return {
    "--glass-backdrop-x": px(monitor.left - windowPosition.x),
    "--glass-backdrop-y": px(monitor.top - windowPosition.y),
    "--glass-backdrop-size": `${px(monitor.width)} ${px(monitor.height)}`,
  };
}
