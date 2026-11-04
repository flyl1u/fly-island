// pnpm dev, then open /tests/settings.html. Without ?test=1 the page is for visual QA:
// ?page=<category> opens that page, ?locale=en switches the language.
// ?test=1 runs the checks below; resize the viewport to 580px wide to cover the narrowest window.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { SettingsWindow } from "../../src/windows/settings/SettingsWindow";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";

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
    case "has_translation_secret": return args.provider === "deepseek";
    case "set_translation_shortcut": return args.shortcut;
    case "updater_configured": return true;
    case "get_updater_proxy": return null;
    case "plugin:app|version": return "0.0.0-test";
    case "get_plugin_market": return {
      indexUrl: "https://raw.githubusercontent.com/TixXin/fly-island/dev/plugins/index.json",
      nodeAvailable: false,
      plugins: [
        { id: "dev.example.todo-sync", name: { "zh-CN": "待办同步示例", en: "Todo sync example" }, description: null, version: "1.1.0", apiVersion: 1, minAppVersion: null, author: "FocuSD", homepage: "", permissions: ["todos:read"], runtime: "powershell", download: { url: "https://example.com/a.zip", sha256: "0".repeat(64), size: 1 }, installedVersion: "1.0.0", incompatible: null },
        { id: "dev.example.new", name: { "zh-CN": "新插件", en: "New plugin" }, description: { "zh-CN": "还没安装。", en: "Not installed yet." }, version: "0.1.0", apiVersion: 1, minAppVersion: null, author: "", homepage: "", permissions: [], runtime: "node", download: { url: "https://example.com/b.zip", sha256: "0".repeat(64), size: 1 }, installedVersion: null, incompatible: null },
      ],
    };
    case "list_plugins": return {
      allowThirdParty: true,
      nodeAvailable: false,
      pluginsDir: "C:\\Users\\demo\\AppData\\Roaming\\com.focusd.island\\plugins",
      plugins: [
        { id: "focusd.local-api", builtin: true, invalidReason: null, name: { "zh-CN": "本地接口", en: "Local API" }, description: { "zh-CN": "让脚本通过 HTTP 读写待办。", en: "Lets scripts read and change todos over HTTP." }, version: "1.0.0", author: "FocuSD", homepage: "", permissions: ["todos:read", "todos:write"], commands: [{ id: "reset-token", title: { "zh-CN": "重新生成令牌", en: "Regenerate token" } }], runtime: "builtin", hasProcess: true, enabled: true, needsApproval: false, status: "running", error: null, log: [], settingsSchema: [{ key: "allowWrite", type: "boolean", title: { "zh-CN": "允许修改", en: "Allow changes" }, default: false }], settings: { allowWrite: false }, info: [{ label: { "zh-CN": "地址", en: "Address" }, value: "http://127.0.0.1:39271/v1", copy: true, secret: false }, { label: { "zh-CN": "访问令牌", en: "Access token" }, value: "0".repeat(64), copy: true, secret: true }] },
        { id: "dev.example.todo-sync", builtin: false, invalidReason: null, name: { "zh-CN": "待办同步示例", en: "Todo sync example" }, description: { "zh-CN": "每 5 分钟把待办数量写进日志。", en: "Logs the todo count every 5 minutes." }, version: "1.0.0", author: "FocuSD", homepage: "https://github.com/flyl1u/fly-island", permissions: ["todos:read", "notes:write"], commands: [{ id: "sync-now", title: { "zh-CN": "立即同步", en: "Sync now" } }], runtime: "node", hasProcess: true, enabled: true, needsApproval: false, status: "running", error: null, log: ["started", "3 open todos"], settingsSchema: [{ key: "interval", type: "number", title: { "zh-CN": "同步间隔（分钟）", en: "Sync every (minutes)" }, min: 1, max: 60, default: 5 }, { key: "notify", type: "boolean", title: { "zh-CN": "同步后提醒", en: "Notify after sync" } }], settings: { interval: 5, notify: false }, info: [{ label: { "zh-CN": "上次同步", en: "Last sync" }, value: "10:30", copy: false, secret: false }, { label: { "zh-CN": "令牌", en: "Token" }, value: "abc123", copy: true, secret: true }] },
        { id: "broken.plugin", builtin: false, invalidReason: "focusd-plugin.json is not valid: expected value at line 1 column 1", name: null, description: null, version: "", author: "", homepage: "", permissions: [], commands: [], runtime: "none", hasProcess: false, enabled: false, needsApproval: false, status: "stopped", error: null, log: [], settingsSchema: [], settings: {}, info: [] },
      ],
    };
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
    check(element(".settings-sidebar__item[data-category='todos']").getAttribute("aria-current") === "page", "A save path request from the island opens the todos page");
    check(document.querySelector(".editor-panel .save-path-panel--attention"), "A save path request from the island highlights the save path");
    await click(".save-path-button");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1_500)); });
    check(document.querySelector(".save-path-button--saved"), "The saved confirmation stays long enough to notice");

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
