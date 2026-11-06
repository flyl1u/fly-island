import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Mirrors LevelChange in src-tauri/src/system_levels/mod.rs: `level` is 0–1. */
export type LevelChange =
  | { kind: "volume"; level: number; muted: boolean }
  | { kind: "brightness"; level: number };

/** Starts or stops the native watcher; it reads nothing while stopped. */
export function setLevelPopupEnabled(enabled: boolean) {
  return invoke<void>("set_level_popup_enabled", { enabled });
}

/** Calls `onChange` for each volume or brightness change; resolves to the unlisten function. */
export function listenLevelChanges(onChange: (change: LevelChange) => void) {
  return listen<LevelChange>("system-level-changed", (event) => onChange(event.payload));
}
