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

export function startIslandDrag() {
  return invoke("start_island_drag");
}

export function resetIslandPosition() {
  return invoke("reset_island_position");
}

export function listenIslandPositionChanged(handler: EventCallback<IslandPosition>) {
  return listen<IslandPosition>(ISLAND_POSITION_CHANGED_EVENT, handler);
}
