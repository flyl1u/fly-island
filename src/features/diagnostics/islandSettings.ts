import type { IslandSettings } from "../appearance/types";
import { NATIVE_PLUGIN_IDS } from "../plugins/native/catalog";
import { loadNativePluginStates } from "../plugins/native/storage";
import { logDiagnostic } from "./api";

export function diagnosticIslandSettings(settings: IslandSettings) {
  const { autoTuck, tuckStyle, tuckDelaySeconds, tuckEdgeHeight, autoTuckRetract, autoTuckRetractDelayMs,
    keepVisibleWhileAgentRunning, keepVisibleWhileLyrics, keepVisibleWhileTodoRunning, gameAutoTuck, gameDoNotDisturb,
    collapsedAutoWidth, collapsedWidth, islandFontPercent, islandMonitor, minimizeAction, expandTrigger,
    islandShape, material, revealOnMessage } = settings;
  return { autoTuck, tuckStyle, tuckDelaySeconds, tuckEdgeHeight, autoTuckRetract, autoTuckRetractDelayMs,
    keepVisibleWhileAgentRunning, keepVisibleWhileLyrics, keepVisibleWhileTodoRunning, gameAutoTuck, gameDoNotDisturb,
    collapsedAutoWidth, collapsedWidth, islandFontPercent, islandMonitor, minimizeAction, expandTrigger,
    islandShape, material, revealOnMessage };
}

export function logStartupSettings(settings: IslandSettings) {
  logDiagnostic("startup", "settings", diagnosticIslandSettings(settings));
  const plugins = loadNativePluginStates();
  for (const id of NATIVE_PLUGIN_IDS) {
    if (plugins.installed[id]) logDiagnostic("startup", "builtin_plugin", { id, enabled: plugins.enabled[id] });
  }
}
