import { invoke, type Channel } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import type { IslandCornerShape, IslandMonitor, TuckStyle } from "../../features/appearance/types";
import type { IslandPosition } from "./storage";
import type { IslandMode, NativeGlassState } from "./types";

// Mirrors TOP_ATTACHMENT_CHANGED_EVENT in src-tauri/src/island/top_edge.rs.
export const TOP_ATTACHMENT_CHANGED_EVENT = "island-top-attachment-changed";

/** Whether the island currently sits flush with the top edge of its monitor. */
export function getIslandTopAttachment(): Promise<boolean> {
  return invoke<boolean>("get_island_top_attachment");
}

export function listenIslandTopAttachment(
  handler: (attached: boolean) => void,
): Promise<UnlistenFn> {
  return listen<boolean>(TOP_ATTACHMENT_CHANGED_EVENT, ({ payload }) => handler(payload));
}

// Mirrors ISLAND_HOVER_CHANGED_EVENT in src-tauri/src/island/passthrough.rs.
export const ISLAND_HOVER_CHANGED_EVENT = "island-hover-changed";

/** Calls `handler` whenever the cursor enters (`true`) or leaves (`false`) the island shape. */
export function listenIslandHover(
  handler: (inside: boolean) => void,
): Promise<UnlistenFn> {
  return listen<boolean>(ISLAND_HOVER_CHANGED_EVENT, ({ payload }) => handler(payload));
}

// 与 src-tauri/src/island/mod.rs 中 start_island_drag 推送的事件名一致。
export const ISLAND_POSITION_CHANGED_EVENT = "island-position-changed";

/** 对应 src-tauri/src/island/mod.rs 的 IslandLayout。 */
export type IslandLayout = { collapsedScale: number; expandedScale: number; marginY: number };

/** set_island_interaction 的参数，字段名与 src-tauri/src/island/mod.rs 中的命令参数一致。 */
export type IslandInteraction = {
  mode: IslandMode;
  collapsedScale: number;
  expandedScale: number;
  marginY: number;
  expandedHeight: number;
  collapsedWidth: number;
  collapsedHeight: number;
  customPosition: IslandPosition | null;
  isTucked: boolean;
  tuckStyle?: TuckStyle;
  /** Px of the island the "edge" tuck leaves on screen (island/geometry.rs). */
  tuckEdgeHeight: number;
  positionLocked: boolean;
  animatePosition: boolean;
  glassEnabled: boolean;
  glassIntensity: number;
  glassTint: string;
  /** Expanded bottom corner radius; the native hit test scales its other corners from it. */
  cornerRadius: number;
  /** The collapsed bar's corner radius; Rust hit-tests it (island/state.rs). */
  collapsedCornerRadius: number;
  /** The native hit test follows the island's corner shape. */
  cornerShape: IslandCornerShape;
  /** Which monitor the island sits on; Rust moves it there (src-tauri/src/island/follow.rs). */
  monitorFollow: IslandMonitor;
  /** A message preview grown with its text (noticeLayout.ts), before scale; null keeps the collapsed size. */
  noticeWidth: number | null;
  noticeHeight: number | null;
  /** Game mode shows a preview without taking clicks (Rust lets the cursor through the island). */
  clickThrough: boolean;
};

/** 对应 src-tauri/src/island/glass_capture.rs 的 GlassCaptureRegion：岛屿在窗口里的区域，物理像素。 */
export type GlassCaptureRegion = { left: number; top: number; width: number; height: number };

/**
 * Starts the glass's live backdrop: frames come to `onFrame` as raw bytes (glassFrame.ts).
 * False where the island cannot be left out of the capture; the glass stays a tint then.
 */
export function startGlassCapture(onFrame: Channel<ArrayBuffer | number[]>) {
  return invoke<boolean>("start_glass_capture", { onFrame });
}

/** null pauses the capture (the island tucked away). */
export function setGlassCaptureRegion(region: GlassCaptureRegion | null, blur: number) {
  return invoke("set_glass_capture_region", { region, blur });
}

export function stopGlassCapture() {
  return invoke("stop_glass_capture");
}

export function setIslandLayout(layout: IslandLayout) {
  return invoke("set_island_layout", { layout });
}

export function setIslandInteraction(interaction: IslandInteraction) {
  return invoke<NativeGlassState>("set_island_interaction", interaction);
}

export function showReadyIsland() {
  return invoke("show_ready_island");
}

export function minimizeIsland() {
  return invoke("minimize_island");
}

/** Query only: a timer must never show a window the user hid to the tray. */
export function isIslandVisible(): Promise<boolean> {
  return getCurrentWindow().isVisible();
}

/**
 * Focuses the island and remembers the window it took the focus from
 * (src-tauri/src/island/focus.rs). Resolves `false` when it did nothing because a
 * mouse button is held; ask again once it is released.
 */
export function takeIslandHoverFocus() {
  return invoke<boolean>("take_island_hover_focus");
}

/** Hands the focus back to that window unless the user has since clicked elsewhere; `false` as above. */
export function releaseIslandHoverFocus() {
  return invoke<boolean>("release_island_hover_focus");
}

// Mirrors FOREGROUND_FULLSCREEN_CHANGED_EVENT in src-tauri/src/system/fullscreen.rs.
export const FOREGROUND_FULLSCREEN_CHANGED_EVENT = "foreground-fullscreen-changed";

/** Mirrors ForegroundFullscreen in src-tauri/src/system/fullscreen.rs. */
export type ForegroundFullscreen = {
  /** A full-screen app (game, full-screen video, slides) is in the foreground. */
  active: boolean;
  /** It fills the monitor the island is on. */
  onIslandMonitor: boolean;
};

/** The full-screen state at the last native check (every 800 ms). */
/** Tells the native side game mode's quiet, so a tucked island lets the cursor through over a game. */
export function setIslandGameQuiet(quiet: boolean) {
  return invoke("set_island_game_quiet", { quiet });
}

export function getForegroundFullscreen() {
  return invoke<ForegroundFullscreen>("get_foreground_fullscreen");
}

export function listenForegroundFullscreen(handler: (state: ForegroundFullscreen) => void): Promise<UnlistenFn> {
  return listen<ForegroundFullscreen>(FOREGROUND_FULLSCREEN_CHANGED_EVENT, ({ payload }) => handler(payload));
}

export function startIslandDrag() {
  return invoke("start_island_drag");
}

export function resetIslandPosition() {
  return invoke("reset_island_position");
}

export function listenIslandPositionChanged(handler: EventCallback<IslandPosition>) {
  return listen<IslandPosition>(ISLAND_POSITION_CHANGED_EVENT, handler);
}

// Mirrors ISLAND_POSITION_CLEARED_EVENT in src-tauri/src/island/follow.rs: following another
// monitor replaced the dragged position.
export const ISLAND_POSITION_CLEARED_EVENT = "island-position-cleared";

export function listenIslandPositionCleared(handler: EventCallback<null>) {
  return listen<null>(ISLAND_POSITION_CLEARED_EVENT, handler);
}

// Mirrors OUTSIDE_CLICK_EVENT in src-tauri/src/island/outside_click.rs: a mouse press outside the
// island window while watching for one.
export const OUTSIDE_CLICK_EVENT = "island-outside-click";

/** Starts or stops looking for mouse presses outside the island window (only while an alert shows). */
export function setIslandOutsideClickWatch(watch: boolean) {
  return invoke<void>("set_island_outside_click_watch", { watch });
}

export function listenIslandOutsideClick(handler: () => void) {
  return listen<null>(OUTSIDE_CLICK_EVENT, () => handler());
}

