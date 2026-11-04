import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
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

// Mirrors ISLAND_MOVE_ARMED_CHANGED_EVENT in src-tauri/src/island/passthrough.rs.
export const ISLAND_MOVE_ARMED_CHANGED_EVENT = "island-move-armed-changed";

/** Calls `handler` whenever holding Ctrl over the island starts (`true`) or stops arming a move. */
export function listenIslandMoveArmed(
  handler: (armed: boolean) => void,
): Promise<UnlistenFn> {
  return listen<boolean>(ISLAND_MOVE_ARMED_CHANGED_EVENT, ({ payload }) => handler(payload));
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
  customPosition: IslandPosition | null;
  isTucked: boolean;
  animatePosition: boolean;
  glassEnabled: boolean;
  glassIntensity: number;
  glassTint: string;
  /** Expanded bottom corner radius; the native hit test scales its other corners from it. */
  cornerRadius: number;
};

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

/** Focuses the island and remembers the window it took the focus from (src-tauri/src/island/focus.rs). */
export function takeIslandHoverFocus() {
  return invoke("take_island_hover_focus");
}

/** Hands the focus back to that window, unless the user has since clicked elsewhere. */
export function releaseIslandHoverFocus() {
  return invoke("release_island_hover_focus");
}

export function startIslandDrag() {
  return invoke("start_island_drag");
}

/** Ctrl + left-button drag; works collapsed or expanded and is a no-op unless Ctrl is held. */
export function startIslandModifierDrag() {
  return invoke("start_island_modifier_drag");
}

export function resetIslandPosition() {
  return invoke("reset_island_position");
}

export function listenIslandPositionChanged(handler: EventCallback<IslandPosition>) {
  return listen<IslandPosition>(ISLAND_POSITION_CHANGED_EVENT, handler);
}
