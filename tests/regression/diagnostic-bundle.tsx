import { act } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { AppLogSettingsSection } from "../../src/features/diagnostics/AppLogSettingsSection";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
const text = TRANSLATIONS[locale].settings.diagnostics;
const root = document.getElementById("root")!;
const results = document.getElementById("results")!;
const persisted = localStorage.getItem("fly-island-settings");
const savedLocale = localStorage.getItem("fly-island-locale");
const path = "C:\\Users\\Ada\\Downloads\\a-deliberately-long-folder-name\\fly-island-diagnostics-2026-11-25.zip";
let outcome: "cancel" | "saved" | "error" = "cancel";
let args: Record<string, unknown> = {};

Object.defineProperty(window, "isTauri", { value: true, configurable: true });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });
localStorage.setItem("fly-island-locale", locale);
localStorage.setItem("fly-island-settings", JSON.stringify({ autoTuck: true, token: "SECRET", todo: "PRIVATE" }));
mockWindows("settings");
mockIPC((command, payload) => {
  if (command === "get_app_log_state") return { enabled: false, path: "", bytes: 0 };
  if (command !== "export_diagnostic_bundle") return null;
  args = (payload ?? {}) as Record<string, unknown>;
  if (outcome === "error") throw new Error("RAW ERROR");
  return outcome === "saved" ? path : null;
});

function check(condition: unknown, label: string) {
  results.textContent += (condition ? "PASS " : "FAIL ") + label + "\n";
  if (!condition) throw new Error(label);
}

async function run() {
  await act(async () => createRoot(root).render(<I18nProvider><AppLogSettingsSection /></I18nProvider>));
  const button = [...root.querySelectorAll("button")].find((item) => item.textContent === text.exportButton)!;
  const click = () => act(async () => button.click());
  check(!button.disabled, "Export is available with disk logging turned off");
  await click();
  check(!root.textContent?.includes(text.exportFailed) && args.title === text.exportTitle, "Cancel does not show an error and picker uses the current language");
  check(!JSON.stringify(args).includes("SECRET") && !JSON.stringify(args).includes("PRIVATE"), "Only the allowed island settings are sent to native code");
  outcome = "saved";
  await click();
  check(root.textContent?.includes(text.exportSaved(path)), "Successful export shows the actual path");
  check(root.scrollWidth <= root.clientWidth, "A long path wraps in the 340px panel");
  outcome = "error";
  await click();
  check(root.textContent?.includes(text.exportFailed) && !root.textContent?.includes("RAW ERROR"), "Write failure shows a localized message without native details");
  document.documentElement.dataset.testResult = "passed";
}

void run().catch((error: unknown) => {
  results.textContent += "FAIL " + String(error);
  document.documentElement.dataset.testResult = "failed";
}).finally(() => {
  if (persisted === null) localStorage.removeItem("fly-island-settings");
  else localStorage.setItem("fly-island-settings", persisted);
  if (savedLocale === null) localStorage.removeItem("fly-island-locale");
  else localStorage.setItem("fly-island-locale", savedLocale);
});
