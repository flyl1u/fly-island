export type TuckSource = "manual" | "idle" | "game" | "browser";

export type BrowserTuckState = {
  enabled: boolean;
  browserOnIslandMonitor: boolean;
  isTucked: boolean;
  tuckSource: TuckSource | null;
  isHovering: boolean;
  gameHolds: boolean;
  hasMessagePreview: boolean;
  isPreviewing: boolean;
};

export function browserTuckDecision(state: BrowserTuckState) {
  const active = state.enabled && state.browserOnIslandMonitor;
  const ownsTuck = state.tuckSource === "browser";
  if (!active && !ownsTuck) return state.enabled ? null : "disabled";
  if (state.gameHolds) return "blocked_game";
  if (state.isPreviewing) return "blocked_settings_preview";
  if (!active) return state.enabled ? "revealed_browser_left" : "revealed_disabled";
  if (state.hasMessagePreview) return "blocked_message_preview";
  if (state.tuckSource === "manual") return "skipped_already_tucked";
  if (state.isTucked) {
    if (ownsTuck) return "tucked";
    return state.tuckSource === "idle" ? "took_over_idle_tuck" : "skipped_already_tucked";
  }
  return state.isHovering ? "waiting_hover" : "tucked";
}
