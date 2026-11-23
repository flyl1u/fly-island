import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { ConfigTransferSection } from "../../src/features/config-transfer/ConfigTransferSection";
import { I18nProvider, TRANSLATIONS, type LocaleCode } from "../../src/i18n";
import { restoreConfigBeforeMount } from "../../src/features/config-transfer/bootstrap";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

const locale: LocaleCode = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
const t = TRANSLATIONS[locale].settings.configTransfer;
const previousStorage = Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("fly-island-")));
function restoreFixtureStorage() {
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("fly-island-"))) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(previousStorage)) localStorage.setItem(key, value);
}
Object.defineProperty(window, "isTauri", { value: true, configurable: true });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
localStorage.setItem("fly-island-locale", locale);
localStorage.setItem("fly-island-future-setting", "raw data");
localStorage.setItem("fly-island-position", "local coordinates");
const calls: { command: string; args: Record<string, unknown> }[] = [];
let save = false;
let invalid = false;
let pendingStorage = false;
let startupReady = false;
const backup = { app: "fly-island", formatVersion: 1, exportedAt: "2026-11-19T00:00:00Z", appVersion: "3.2.8",
  localStorage: { "fly-island-locale": locale, "fly-island-restored": "raw restored" }, files: { clipboard: { history: null } } };
mockWindows("settings");
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  switch (command) {
    case "get_config_import_report": return { missingPlugins: ["demo@1.0.0"], warnings: [] };
    case "dismiss_config_import_report": return null;
    case "export_config": return save;
    case "read_config_import": return invalid ? { ...backup, formatVersion: 99 } : backup;
    case "stage_config_import": return { includesClipboardHistory: false };
    case "restart_after_config_import": return null;
    case "config_transfer_startup": return { ready: startupReady, localStorage: pendingStorage ? backup.localStorage : null };
    case "finish_config_import": startupReady = true; pendingStorage = false; return null;
    default: return null;
  }
});

const results: string[] = [];
function check(condition: unknown, description: string) {
  results.push(`${condition ? "PASS" : "FAIL"} ${description}`);
  document.getElementById("results")!.textContent = results.join("\n");
  if (!condition) throw new Error(description);
}
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;
const click = async (text: string) => { await act(async () => { button(text).click(); }); };

async function run() {
  await act(async () => createRoot(document.getElementById("root")!).render(<I18nProvider><ConfigTransferSection /></I18nProvider>));
  check(document.body.textContent?.includes(t.success) && document.body.textContent?.includes("demo@1.0.0") && document.body.textContent?.includes(t.credentials), "Completion report lists missing plugins and reauthentication");
  await click(t.dismiss);
  check(calls.some(c => c.command === "dismiss_config_import_report"), "Completion report is dismissed explicitly");
  await click(t.export);
  const checkbox = () => document.querySelector<HTMLInputElement>(".config-transfer__checkbox input")!;
  check(!checkbox().checked, "Clipboard history is unchecked by default");
  await click(t.continue);
  check(Boolean(checkbox()), "Cancelling the native save dialog keeps the export choices");
  const firstExport = calls.find(c => c.command === "export_config")!;
  const storage = firstExport.args.localStorage as Record<string, string>;
  check(firstExport.args.includeClipboardHistory === false && storage["fly-island-future-setting"] === "raw data" && !("fly-island-position" in storage), "Export discovers future keys and excludes this machine's coordinates");
  save = true;
  await act(async () => { checkbox().click(); });
  await click(t.continue);
  check(calls.filter(c => c.command === "export_config").slice(-1)[0]?.args.includeClipboardHistory === true && document.body.textContent?.includes(t.exported), "Explicit clipboard opt-in is sent and successful export is shown");
  invalid = true;
  await click(t.import);
  check(document.body.textContent?.includes(t.unsupportedVersion) && !button(t.confirmAction), "Unsupported versions fail before confirmation");
  invalid = false;
  await click(t.import);
  check(document.body.textContent?.includes(t.confirm) && document.body.textContent?.includes(t.clipboardExcluded), "Import explains replacement and preserved clipboard history");
  await click(t.confirmAction);
  check(!calls.some(c => c.command === "stage_config_import") && document.body.textContent?.includes(t.confirmAgain), "First confirmation cannot write data or restart");
  await click(t.cancel);
  check(!calls.some(c => c.command === "stage_config_import"), "Cancelling the second confirmation leaves configuration untouched");
  await click(t.import);
  await click(t.confirmAction);
  await click(t.restartAction);
  check(calls.some(c => c.command === "stage_config_import") && calls[calls.length - 1]?.command === "restart_after_config_import", "Only final confirmation stages the backup then restarts");
  check(document.getElementById("root")!.scrollWidth <= document.getElementById("root")!.clientWidth, "The 340px panel does not overflow");
  pendingStorage = true;
  await restoreConfigBeforeMount();
  check(localStorage.getItem("fly-island-restored") === "raw restored" && localStorage.getItem("fly-island-future-setting") === null
    && localStorage.getItem("fly-island-position") === "local coordinates" && calls.some(c => c.command === "finish_config_import" && c.args.success === true), "Startup restores raw values, clears absent keys, preserves coordinates and acknowledges the native transaction");
  restoreFixtureStorage();
  document.documentElement.dataset.testResult = "passed";
}
void run().catch(error => {
  restoreFixtureStorage();
  results.push(`FAIL ${String(error)}`);
  document.getElementById("results")!.textContent = results.join("\n");
  document.documentElement.dataset.testResult = "failed";
});
