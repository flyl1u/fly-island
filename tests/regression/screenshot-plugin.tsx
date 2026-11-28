import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { I18nProvider, TRANSLATIONS } from "../../src/i18n";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import { ScreenshotPluginSettings } from "../../src/windows/settings/ScreenshotPluginSettings";
import { PluginsSettingsPage } from "../../src/windows/settings/PluginsSettingsPage";
import { useIslandScreenshot } from "../../src/windows/island/useIslandScreenshot";
import { loadNativePluginStates } from "../../src/features/plugins/native/storage";
import { loadScreenshotSettings } from "../../src/features/screenshot/storage";
import { updateScreenshotSettings } from "../../src/features/screenshot/useScreenshotSettings";
import { useDocumentTheme, useStoredTheme } from "../../src/features/appearance/useDocumentTheme";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search), lang = query.has("lang") ? "en" : "zh-CN";
localStorage.setItem("fly-island-locale", lang);
localStorage.setItem("fly-island-native-plugins", '["clockWeather"]');
localStorage.setItem("fly-island-native-plugins-disabled", "[]");
localStorage.removeItem("fly-island-screenshot-settings");
localStorage.setItem("fly-island-settings", JSON.stringify({ colorScheme: query.get("theme") ?? "dark" }));
mockWindows("main");
const t = TRANSLATIONS[lang], p = t.screenshot.plugin, market = t.settings.plugins.market;
const configurations: { enabled: boolean; shortcut: string }[] = [];
let enabled = false, shortcut = "", starts = 0, blockDefault = false;
let ocrInstalled = false, ocrDownloads = 0;
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "configure_screenshot_plugin") {
    const config = { enabled: Boolean(args.enabled), shortcut: String(args.shortcut) };
    configurations.push(config);
    if (config.enabled && (config.shortcut === "Ctrl+Alt+J" || blockDefault && config.shortcut === "Alt+A")) return Promise.reject("Shortcut occupied by another app");
    enabled = config.enabled; shortcut = enabled ? config.shortcut : ""; return shortcut;
  }
  if (command === "screenshot_capabilities") return { version: 1, screenshot: true, scroll: false, recording: false };
  if (command === "screenshot_ocr_installed") return ocrInstalled;
  if (command === "install_screenshot_ocr") {
    if (++ocrDownloads === 1) return Promise.reject("Download interrupted");
    ocrInstalled = true; return null;
  }
  if (command === "screenshot_start_task") { starts++; return null; }
  if (command === "get_plugins") return { registry: { developerMode: false, indexUrl: "", installed: {} }, live: {} };
  if (command === "get_plugins_index") return [];
  if (command === "get_clipboard_history") return { settings: { enabled: true, captureImages: false, maxItems: 100, shortcutEnabled: true, shortcut: "Ctrl+Alt+V" }, items: [] };
  return null;
}, { shouldMockEvents: true });
function Harness() {
  useDocumentTheme(useStoredTheme());
  useIslandScreenshot();
  const [page, setPage] = useState(false);
  return <div style={{ height: "100%", overflow: "auto", padding: 16, color: "var(--color-text)", background: "var(--color-window)" }}>
    {page ? <ScreenshotPluginSettings settings={DEFAULT_SETTINGS} onBack={() => setPage(false)} />
      : <PluginsSettingsPage settings={DEFAULT_SETTINGS} onSettingsChange={() => {}} onOpenSettings={() => setPage(true)} />}
  </div>;
}
const messages: string[] = [];
const check = (ok: unknown, label: string) => {
  messages.push((ok ? "PASS " : "FAIL ") + label);
  document.getElementById("results")!.textContent = messages.join("\n");
};
window.addEventListener("unhandledrejection", (event) => {
  check(false, String(event.reason)); document.documentElement.dataset.testResult = "failed";
});
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 35)); }); };
const click = async (node: HTMLElement) => { await act(async () => node.click()); await settle(); };
const named = (label: string) => document.querySelector<HTMLElement>('[aria-label="' + label + '"]')!;
const textButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === text)!;
const root = createRoot(document.getElementById("root")!);
await act(async () => root.render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>));
await settle();
check(!!named(market.installNamed(market.items.screenshot.name)) && !named(market.openSettingsNamed(market.items.screenshot.name)), "screenshot is separately installable and has no settings action before installation");
check(configurations.every((config) => !config.enabled) && !enabled && !starts, "uninstalled plugin registers no shortcut and starts no capture");
await click(named(market.installNamed(market.items.screenshot.name)));
check(enabled && shortcut === "Alt+A" && loadNativePluginStates().enabled.clockWeather, "install activates only screenshot with default Alt+A");
await click(named(market.openSettingsNamed(market.items.screenshot.name)));
check(!!document.querySelector(".screenshot-plugin-settings"), "installed card opens screenshot settings");
check(ocrDownloads === 0 && !!textButton(p.ocrDownload), "enhanced OCR is optional and opening settings downloads nothing");
await click(textButton(p.ocrDownload));
check(!!document.querySelector('[role="alert"]') && !ocrInstalled, "an interrupted OCR pack download reports failure and allows retry");
await click(textButton(p.ocrDownload));
check(ocrInstalled && textButton(p.ocrInstalledAction).disabled, "successful OCR download is shown as installed");
const disabledSwitches = [...document.querySelectorAll<HTMLInputElement>('input[role="switch"]:disabled')];
check(disabledSwitches.length === 2 && document.body.textContent?.includes(p.longCapture) && document.body.textContent?.includes(p.recording) && document.body.textContent?.includes(p.developing), "scrolling capture and recording have disabled In development switches");
const record = async (key: string, code: string, ctrlKey = true, shiftKey = false, altKey = false) => {
  await click(document.querySelector<HTMLButtonElement>(".shortcut-record-button")!);
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key, code, ctrlKey, shiftKey, altKey, bubbles: true })));
  await settle();
};
await record("F9", "F9", true, true);
check(shortcut === "Ctrl+Shift+F9" && loadScreenshotSettings().shortcut === shortcut, "recorded hotkey is applied and persisted");
await record("j", "KeyJ", true, false, true);
check(shortcut === "Ctrl+Shift+F9" && loadScreenshotSettings().shortcut === shortcut && document.querySelector('[role="alert"]')?.textContent?.includes("occupied"), "OS registration conflict preserves previous saved and active shortcut");
const beforeConflict = configurations.length;
await record("v", "KeyV", true, false, true);
check(configurations.length === beforeConflict && shortcut === "Ctrl+Shift+F9" && !!document.querySelector('[role="alert"]'), "conflict with another Fly Island function is rejected before native registration");
const rowSwitch = (title: string) => {
  const row = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((node) => node.textContent?.includes(title));
  return row!.querySelector<HTMLInputElement>('input[role="switch"]')!;
};
await click(rowSwitch(p.magnifier));
check(!loadScreenshotSettings().showMagnifier, "capture assistance preferences are independent and saved");
await click(rowSwitch(p.shortcutEnabled));
check(enabled && shortcut === "", "turning off only the hotkey keeps the screenshot plugin enabled");
await click(textButton(p.captureNow));
check(starts === 1, "Capture now works when the hotkey is disabled");
await click(rowSwitch(p.shortcutEnabled));
await click(rowSwitch(p.enabled));
check(!enabled && !loadNativePluginStates().enabled.screenshot && loadNativePluginStates().enabled.clockWeather, "disabling screenshot leaves other plugins on");
await click(textButton(p.back));
await click(named(market.enableNamed(market.items.screenshot.name)));
check(enabled && shortcut === "Ctrl+Shift+F9", "re-enabling restores the customized hotkey");
await click(named(market.uninstallNamed(market.items.screenshot.name)));
check(!enabled && !loadNativePluginStates().installed.screenshot && loadNativePluginStates().enabled.clockWeather && !named(market.openSettingsNamed(market.items.screenshot.name)), "uninstall removes screenshot controls and unregisters its shortcut only");
await click(named(market.installNamed(market.items.screenshot.name)));
check(loadScreenshotSettings().shortcut === "Ctrl+Shift+F9", "reinstall retains user preferences");
await click(named(market.uninstallNamed(market.items.screenshot.name)));
blockDefault = true;
await act(async () => { updateScreenshotSettings({ shortcut: "Alt+A" }); });
await click(named(market.installNamed(market.items.screenshot.name)));
check(loadNativePluginStates().installed.screenshot && !loadNativePluginStates().enabled.screenshot && !enabled && document.querySelector(".screenshot-plugin-alert")?.textContent?.includes(p.installedNeedsShortcut), "first-install conflict automatically opens settings with a persistent and explicit installed-but-disabled notice");
await click(textButton(p.back));
await click(named(market.openSettingsNamed(market.items.screenshot.name)));
check(!!document.querySelector(".screenshot-plugin-alert"), "unresolved conflict remains visible after returning to the plugin card");
await click(textButton(p.changeShortcut));
check(document.querySelector(".shortcut-record-button")?.getAttribute("aria-pressed") === "true", "notice action starts recording directly without an extra search or click");
await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "F9", code: "F9", ctrlKey: true, shiftKey: true, bubbles: true })));
await settle();
check(enabled && shortcut === "Ctrl+Shift+F9" && !document.querySelector(".screenshot-plugin-alert"), "successful replacement automatically enables screenshot and clears the notice");
await click(textButton(p.back));
await click(named(market.uninstallNamed(market.items.screenshot.name)));
await act(async () => { updateScreenshotSettings({ shortcut: "Alt+A" }); });
await click(named(market.installNamed(market.items.screenshot.name)));
await click(textButton(p.useWithoutShortcut));
check(enabled && shortcut === "" && !loadScreenshotSettings().shortcutEnabled && !document.querySelector(".screenshot-plugin-alert"), "alternative action enables capture without a global shortcut and resolves the notice");
check([...document.querySelectorAll<HTMLElement>(".screenshot-plugin-settings button, .shortcut-control")].every((node) => node.getBoundingClientRect().right <= innerWidth + 1), "settings controls fit the available width");
document.getElementById("results")!.textContent = messages.join("\n");
document.documentElement.dataset.testResult = messages.some((line) => line.startsWith("FAIL")) ? "failed" : "passed";
if (query.has("preview")) document.getElementById("results")!.style.display = "none";
