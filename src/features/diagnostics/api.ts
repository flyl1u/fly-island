import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Mirrors APP_LOG_CHANGED_EVENT in src-tauri/src/app_log/mod.rs.
export const APP_LOG_CHANGED_EVENT = "app-log-changed";

export type AppLogState = { enabled: boolean; path: string; bytes: number };
export type AppLogEntry = { level: "error" | "warn"; message: string };
export type DiagnosticCategory = "island" | "window" | "fullscreen" | "media" | "weather" | "plugin" | "update" | "startup";

export function logDiagnostic(category: DiagnosticCategory, name: string, fields: Readonly<Record<string, string | number | boolean>>) {
  if (!isTauri()) return;
  void invoke<void>("record_diagnostic", { diagnostic: { category, name, fields } }).catch(() => {});
}

export function getAppLogState() {
  return invoke<AppLogState>("get_app_log_state");
}

export function setAppLogEnabled(enabled: boolean) {
  return invoke<AppLogState>("set_app_log_enabled", { enabled });
}

export function appendAppLog(entries: AppLogEntry[]) {
  return invoke<void>("append_app_log", { entries });
}

export function openAppLogFolder() {
  return invoke<void>("open_app_log_folder");
}

export function clearAppLog() {
  return invoke<AppLogState>("clear_app_log");
}

export function listenAppLogChanged(handler: (enabled: boolean) => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen<boolean>(APP_LOG_CHANGED_EVENT, ({ payload }) => handler(payload));
}
