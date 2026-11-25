import type { IslandMode } from "./types";

export type IslandModeReason = "launch" | "click" | "hover" | "hover_leave" | "idle_timer" | "game_mode" | "browser"
  | "minimize_button" | "message" | "keep_visible" | "peek_timeout" | "preview" | "shortcut" | "focus_lost";

export function diagnosticMode(mode: IslandMode, tucked: boolean, peeking: boolean) {
  if (tucked) return "tucked";
  if (mode === "expanded") return "expanded";
  return peeking ? "peek" : "collapsed";
}
