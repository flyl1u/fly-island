// pnpm dev, then open /tests/settings.html. Without ?test=1 the page is for visual QA:
// ?page=<category> opens that page, ?locale=en switches the language.
// ?test=1 runs the checks below; resize the viewport to 580px wide to cover the narrowest window.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../src/styles/tokens.css";
import "../src/styles/fonts.css";
import "../src/styles/base.css";
import { SettingsWindow } from "../src/windows/settings/SettingsWindow";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../src/i18n";

const query = new URLSearchParams(location.search);
const automated = query.has("test");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: automated });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
const restore = () => {
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("focusd-island-"))) {
    if (!original.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of original) localStorage.setItem(key, value);
};
window.addEventListener("beforeunload", restore);

localStorage.setItem(LOCALE_STORAGE_KEY, query.get("locale") === "en" ? "en" : "zh-CN");
// The checks below expect a customized look plus a General page choice that a reset must keep.
if (automated) localStorage.setItem("focusd-island-settings", JSON.stringify({ opacity: 60, carryOverIncompleteTodos: true }));
else localStorage.removeItem("focusd-island-settings");
localStorage.setItem("focusd-island-save-directory", "");
localStorage.setItem("focusd-island-qq-notification-access-requested", "true");

let revision = 0;
const commands: string[] = [];
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "get_launch_at_startup": return false;
    case "set_launch_at_startup": return null;
    case "get_default_todo_save_directory": return "";
    case "get_clipboard_history":
    case "set_clipboard_history_settings":
      return { settings: { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: true, ...(args.settings as object | undefined) }, items: [] };
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "C:\\Users\\demo\\AppData\\Roaming\\com.focusd.island\\agent-status.json" };
    case "get_qq_notification_state": return { revision: ++revision, enabled: false, status: "disabled", items: [], error: null };
    case "set_qq_notifications_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", pending: false, lastAttentionAt: null, error: null };
    case "updater_configured": return true;
    case "get_updater_proxy": return null;
    case "plugin:app|version": return "0.0.0-test";
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("settings");

const root = createRoot(document.getElementById("root")!);
const mount = () => root.render(<StrictMode><I18nProvider><SettingsWindow /></I18nProvider></StrictMode>);
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const element = <T extends HTMLElement>(selector: string) => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
};
const click = async (selector: string) => {
  const target = element<HTMLButtonElement>(selector);
  await act(async () => { target.click(); });
};
const openPage = (category: string) => click(`.settings-sidebar__item[data-category='${category}']`);
const categories = () =>
  [...document.querySelectorAll<HTMLElement>(".settings-sidebar__item")].map(item => item.dataset.category!);

if (!automated) {
  mount();
  const page = query.get("page");
  const openRequestedPage = () => {
    const item = document.querySelector<HTMLButtonElement>(`.settings-sidebar__item[data-category='${page}']`);
    if (item) item.click();
    else setTimeout(openRequestedPage, 20);
  };
  if (page) openRequestedPage();
} else {
  try {
    await act(async () => { mount(); });
    check(categories().length > 0, "The sidebar lists the settings pages");

    for (const category of categories()) {
      await openPage(category);
      const item = element(`.settings-sidebar__item[data-category='${category}']`);
      const panel = element(".editor-panel");
      check(item.getAttribute("aria-current") === "page", `${category}: the sidebar marks the open page`);
      check(element(".settings-page__title").textContent === item.textContent, `${category}: the page title matches the sidebar`);
      check(panel.querySelector(".settings-section"), `${category}: the page has content`);
      check(panel.scrollWidth <= panel.clientWidth, `${category}: nothing overflows horizontally`);
    }

    const storedSettings = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { opacity?: number; carryOverIncompleteTodos?: boolean };
    check(!document.querySelector(".appearance-reset"), "Reset appearance is not offered outside the appearance page");
    await openPage("appearance");
    await click(".appearance-reset");
    check(storedSettings().opacity === 60, "The first reset click only asks for confirmation");
    await click(".appearance-reset__confirm .appearance-reset:not(.appearance-reset--danger)");
    check(storedSettings().opacity === 60 && document.querySelector(".appearance-reset"), "Cancelling keeps the appearance");
    await click(".appearance-reset");
    await click(".appearance-reset--danger");
    check(storedSettings().opacity === 95, "Confirming resets the appearance");
    check(storedSettings().carryOverIncompleteTodos === true, "Resetting the appearance keeps todo settings");

    const agentPolls = () => commands.filter(command => command === "get_agent_status").length;
    const pollsAway = agentPolls();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1_200)); });
    check(agentPolls() === pollsAway, "Agent status is not polled while its page is closed");

    await act(async () => {
      localStorage.setItem("focusd-island-settings-focus", JSON.stringify({ section: "savePath", requestedAt: Date.now() }));
      window.dispatchEvent(new StorageEvent("storage", { key: "focusd-island-settings-focus", newValue: "x", storageArea: localStorage }));
    });
    check(document.querySelector(".editor-panel .save-path-panel--attention"), "A save path request from the island opens and highlights the save path");

    await act(async () => { root.unmount(); });
    document.documentElement.dataset.testResult = "passed";
  } catch (error) {
    document.documentElement.dataset.testResult = "failed";
    messages.push(`FAIL ${String(error)}`);
    console.error(error);
  } finally {
    restore();
    document.getElementById("results")!.textContent = messages.join("\n");
  }
}
