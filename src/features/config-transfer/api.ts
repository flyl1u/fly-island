import { invoke } from "@tauri-apps/api/core";
import type { ConfigBackup } from "./format";

/** Mirrors config_transfer/mod.rs::Report. No credentials or file contents in the result. */
export type ImportReport = { missingPlugins: string[]; warnings: string[] };
/** Mirrors config_transfer/mod.rs::StartupState. Only main receives the restore payload. */
type StartupState = { ready: boolean; localStorage: Record<string, string> | null };

export function exportConfig(localStorage: Record<string, string>, includeClipboardHistory: boolean, title: string) {
  return invoke<boolean>("export_config", { localStorage, includeClipboardHistory, exportedAt: new Date().toISOString(), title });
}
export function readConfigImport(title: string) { return invoke<ConfigBackup | null>("read_config_import", { title }); }
export function stageConfigImport(backup: ConfigBackup) {
  return invoke<{ includesClipboardHistory: boolean }>("stage_config_import", { backup });
}
export function restartAfterImport() { return invoke<void>("restart_after_config_import"); }
export function readTransferStartup() { return invoke<StartupState>("config_transfer_startup"); }
export function finishConfigImport(success: boolean) { return invoke<void>("finish_config_import", { success }); }
export function getImportReport() { return invoke<ImportReport | null>("get_config_import_report"); }
export function dismissImportReport() { return invoke<void>("dismiss_config_import_report"); }
