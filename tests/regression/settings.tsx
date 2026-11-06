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
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import type { MailSnapshot } from "../../src/features/messages/mail/api";
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
const revokedPermissions: string[] = [];
const mailCalls: { command: string; args: Record<string, unknown> }[] = [];
const mailbox = (email: string, extra: Partial<MailSnapshot> = {}): MailSnapshot => ({
  revision: ++revision, email, configured: true, enabled: true, syncing: false, status: "connected",
  unreadCount: 2, items: [], lastSyncedAt: 0, error: null, ...extra,
});
let mailboxes: MailSnapshot[] = [mailbox("demo@qq.com"), mailbox("louis@163.com", { status: "authRequired", enabled: false, unreadCount: null })];
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "revoke_plugin_sensitive_permission") revokedPermissions.push(String(args.permission));
  switch (command) {
    case "get_launch_at_startup": return false;
    case "set_launch_at_startup": return null;
    case "get_default_todo_save_directory": return "";
    case "get_clipboard_history":
    case "set_clipboard_history_settings":
      return { settings: { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: true, ...(args.settings as object | undefined) }, items: [] };
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "C:\\Users\\demo\\AppData\\Roaming\\com.focusd.island\\agent-status.json" };
    case "get_qq_mail_state": return mailboxes;
    case "connect_qq_mail":
    case "disconnect_qq_mail":
    case "set_qq_mail_enabled": {
      mailCalls.push({ command, args });
      const email = String(args.email).trim().toLowerCase();
      const next = command === "disconnect_qq_mail"
        ? mailbox(email, { configured: false, enabled: false, status: "disconnected", unreadCount: null })
        : mailbox(email, { enabled: args.enabled !== false, status: args.enabled === false ? "paused" : "connected" });
      mailboxes = [...mailboxes.filter((box) => box.email !== email), ...(next.configured ? [next] : [])];
      return next;
    }
    case "get_qq_notification_state": return { revision: ++revision, enabled: false, status: "disabled", items: [], error: null };
    case "set_qq_notifications_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", pending: false, lastAttentionAt: null, error: null };
    case "has_translation_secret": return args.provider === "deepseek";
    case "set_translation_shortcut": return args.shortcut;
    case "updater_configured": return true;
    case "get_updater_proxy": return null;
    case "plugin:app|version": return "0.0.0-test";
    case "get_cached_plugin_market": return null;
    case "get_plugin_market": return {
      indexUrl: "https://raw.githubusercontent.com/TixXin/focusd-plugins/main/index.json",
      nodeAvailable: false,
      trustedPublishers: [],
      officialPublisher: "TixXin",
      plugins: [
        { id: "dev.example.todo-sync", name: { "zh-CN": "待办同步示例", en: "Todo sync example" }, description: null, version: "1.1.0", apiVersion: 1, minAppVersion: null, author: "FocuSD", homepage: "", permissions: ["todos:read"], runtime: "powershell", download: { url: "https://example.com/a.zip", sha256: "0".repeat(64), size: 1 }, publisher: null, repo: "TixXin/fly-island", categories: ["todos", "productivity"], readme: "# 待办同步\n\n每 **5 分钟**同步一次，见 [文档](https://example.com/docs)。\n\n- 读取待办\n- 写入日志", changelog: "## 1.1.0\n\n- 新增同步间隔设置", installedVersion: "1.0.0", incompatible: null, revoked: null },
        { id: "dev.example.new", name: { "zh-CN": "新插件", en: "New plugin" }, description: { "zh-CN": "还没安装。", en: "Not installed yet." }, version: "0.1.0", apiVersion: 1, minAppVersion: null, author: "", homepage: "", permissions: [], runtime: "node", download: { url: "https://example.com/b.zip", sha256: "0".repeat(64), size: 1 }, publisher: "someone-with-a-long-github-name", repo: null, categories: ["developer"], installedVersion: null, incompatible: null, revoked: null },
      ],
    };
    case "list_plugins": {
      const base = { dev: false, notificationsMuted: false, keybindingConflicts: [], keybindings: {}, sensitive: {}, activation: "startup", activationEvents: [], startupMs: null, resources: null, keepAlive: null, revoked: null, updateAvailable: null, autoUpdated: null, preRelease: false, preReleaseAvailable: null, memoryLimitMb: 512 };
      return {
      allowThirdParty: true,
      nodeAvailable: false,
      autoUpdate: false,
      trustedPublishers: ["someone"],
      pluginsDir: "C:\\Users\\demo\\AppData\\Roaming\\com.focusd.island\\plugins",
      plugins: [
        { ...base, id: "focusd.local-api", builtin: true, invalidReason: null, name: { "zh-CN": "本地接口", en: "Local API" }, description: { "zh-CN": "让脚本通过 HTTP 读写待办。", en: "Lets scripts read and change todos over HTTP." }, version: "1.0.0", author: "FocuSD", homepage: "", permissions: ["todos:read", "todos:write"], commands: [{ id: "reset-token", title: { "zh-CN": "重新生成令牌", en: "Regenerate token" } }], runtime: "builtin", hasProcess: true, enabled: true, needsApproval: false, status: "running", error: null, log: [], settingsSchema: [{ key: "allowWrite", type: "boolean", title: { "zh-CN": "允许修改", en: "Allow changes" }, default: false }], settings: { allowWrite: false }, info: [{ label: { "zh-CN": "地址", en: "Address" }, value: "http://127.0.0.1:39271/v1", copy: true, secret: false }, { label: { "zh-CN": "访问令牌", en: "Access token" }, value: "0".repeat(64), copy: true, secret: true }] },
        { ...base, activation: "onDemand", activationEvents: ["onCommand:sync-now", "onUri"], sensitive: { uri: "allowed" }, preReleaseAvailable: "1.1.0-beta.1", startupMs: 120, resources: { memoryBytes: 24 * 1024 * 1024, runtimeBytes: 20 * 1024 * 1024, processes: [{ name: "node.exe", memoryBytes: 24 * 1024 * 1024, workingSetBytes: 31 * 1024 * 1024 }], cpuPercent: 0.4, highCpu: false }, id: "dev.example.todo-sync", builtin: false, invalidReason: null, name: { "zh-CN": "待办同步示例", en: "Todo sync example" }, description: { "zh-CN": "每 5 分钟把待办数量写进日志，同步完成后可以在岛上提醒，也可以读取剪贴板里的待办文本并自动拆成多条待办。这段描述故意写长，用来检查两行截断。", en: "Logs the todo count every 5 minutes, can notify on the island after a sync, and can read todo text from the clipboard and split it into several todos. Long on purpose to check the two-line clamp." }, version: "1.0.0", author: "FocuSD", homepage: "https://github.com/flyl1u/fly-island", permissions: ["todos:read", "todos:write", "notes:write", "island:notify", "clipboard:read"], commands: [{ id: "sync-now", title: { "zh-CN": "立即同步", en: "Sync now" } }], runtime: "node", hasProcess: true, enabled: true, needsApproval: false, status: "running", error: null, log: ["started", "3 open todos"], settingsSchema: [{ key: "interval", type: "number", title: { "zh-CN": "同步间隔（分钟）", en: "Sync every (minutes)" }, min: 1, max: 60, default: 5 }, { key: "notify", type: "boolean", title: { "zh-CN": "同步后提醒", en: "Notify after sync" } }], settings: { interval: 5, notify: false }, info: [{ label: { "zh-CN": "上次同步", en: "Last sync" }, value: "10:30", copy: false, secret: false }, { label: { "zh-CN": "令牌", en: "Token" }, value: "abc123", copy: true, secret: true }] },
        { ...base, id: "broken.plugin", builtin: false, invalidReason: "focusd-plugin.json is not valid: expected value at line 1 column 1", name: null, description: null, version: "", author: "", homepage: "", permissions: [], commands: [], runtime: "none", hasProcess: false, enabled: false, needsApproval: false, status: "stopped", error: null, log: [], settingsSchema: [], settings: {}, info: [] },
      ],
      };
    }
    // Development mode (P10): on, with one plugin loaded from a folder and some JSON-RPC lines.
    case "get_plugin_dev_state":
    case "set_plugin_dev_mode":
    case "load_dev_plugin":
      return { enabled: true, plugins: [{ id: "me.very-long-plugin-id-to-check-wrapping", path: "D:\code\plugins\a-folder-with-a-rather-long-name\me.very-long-plugin-id-to-check-wrapping" }] };
    case "get_plugin_rpc_trace": return [
      { at: Date.now() - 2000, outgoing: true, text: JSON.stringify({ jsonrpc: "2.0", method: "initialize", params: { apiVersion: 2, pluginId: "me.very-long-plugin-id-to-check-wrapping", settings: { repo: "a/b" } } }) },
      { at: Date.now() - 1000, outgoing: false, text: '{"jsonrpc":"2.0","id":1,"method":"view.update","params":{"viewId":"main","model":{"items":[]}}}' },
    ];
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
/** Types into a controlled input the way a user would, so React sees the change. */
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
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

    await openPage("plugins");
    const runLine = [...document.querySelectorAll<HTMLElement>(".plugin-card__hint")].find((hint) => hint.textContent?.startsWith("内存"));
    check(runLine?.textContent === "内存 4.0 MB",
      "A plugin's card shows only the plugin's own memory, without the runtime");
    check(runLine?.title.includes("node.exe：已提交 24.0 MB，工作集 31.0 MB") && runLine.title.includes("进程合计 24.0 MB，其中 Node.js 本身占 20.0 MB") && runLine.title.includes("提交大小"),
      "Hovering the run line lists each process, the runtime's share and explains the numbers");
    check([...document.querySelectorAll(".plugin-card__hint")].some((hint) => hint.textContent === "有预发布版本 v1.1.0-beta.1，可在插件设置里选择接收。"),
      "A plugin with a pre-release in the market says so on its card");
    const syncCard = [...document.querySelectorAll<HTMLElement>(".plugin-card")].find((card) => card.textContent?.includes("待办同步示例"));
    await act(async () => { [...(syncCard?.querySelectorAll<HTMLButtonElement>(".plugin-card__button") ?? [])].find((button) => button.textContent === "设置")?.click(); });
    const sensitiveRows = [...document.querySelectorAll<HTMLElement>(".plugin-detail__sensitive li")];
    const linkRow = sensitiveRows.find((row) => row.textContent?.includes("focusd:// 链接"));
    check(sensitiveRows.length === 2 && linkRow?.querySelector("em")?.textContent === "已允许",
      "A plugin that lists onUri shows the remembered answer for links next to its sensitive permissions");
    await act(async () => { linkRow?.querySelector("button")?.click(); });
    check(revokedPermissions.includes("uri"),
      "Revoking the link answer forgets it like a sensitive permission");
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "返回插件列表")?.click(); });

    await openPage("market");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const marketItem = [...document.querySelectorAll<HTMLElement>(".plugin-market__item")].find((item) => item.textContent?.includes("待办同步示例"));
    const detailsButton = [...(marketItem?.querySelectorAll<HTMLButtonElement>("button[aria-expanded]") ?? [])][0];
    await act(async () => { detailsButton?.click(); });
    check(marketItem?.querySelector(".plugin-market__doc h3")?.textContent === "待办同步"
      && marketItem.querySelector(".plugin-market__doc strong")?.textContent === "5 分钟"
      && marketItem.querySelector(".plugin-market__doc a")?.getAttribute("href") === "https://example.com/docs"
      && marketItem.querySelectorAll(".plugin-market__doc li").length === 2,
      "The market details render the plugin's README");
    check(marketItem?.querySelector(".plugin-market__history summary")?.textContent === "版本历史"
      && marketItem.querySelector(".plugin-market__history h4")?.textContent === "1.1.0",
      "The market details show the plugin's version history");

    const storedSettings = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { opacity?: number; carryOverIncompleteTodos?: boolean };
    check(!document.querySelector(".appearance-reset"), "Reset appearance is not offered outside the appearance page");
    await openPage("appearance");
    await click(".appearance-reset");
    check(storedSettings().opacity === 60, "The first reset click only asks for confirmation");
    await click(".appearance-reset__confirm .appearance-reset:not(.appearance-reset--danger)");
    check(storedSettings().opacity === 60 && document.querySelector(".appearance-reset"), "Cancelling keeps the appearance");
    await click(".appearance-reset");
    await click(".appearance-reset--danger");
    check(storedSettings().opacity === DEFAULT_SETTINGS.opacity, "Confirming resets the appearance");
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

    await openPage("mail");
    const rows = () => [...document.querySelectorAll<HTMLElement>(".mail-settings__account")];
    check(rows().length === 2 && rows()[0].textContent?.includes("demo@qq.com"), "The mail page lists every mailbox");
    const rowButton = (row: number, text: string) => [...rows()[row].querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text));
    await act(async () => { rowButton(1, "重新授权")!.click(); });
    const formEmail = () => element<HTMLInputElement>(".mail-settings__form input[type='email']");
    check(formEmail().value === "louis@163.com" && formEmail().disabled && !document.querySelector(".mail-settings__form input[type='text']"),
      "Re-authorizing fixes the address and hides the server field");
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>(".mail-settings__form button")].find((button) => button.textContent === "取消")!.click(); });
    await act(async () => { rowButton(0, "断开")!.click(); });
    check(!mailCalls.some((call) => call.command === "disconnect_qq_mail") && document.querySelector(".mail-settings__confirm"),
      "The first disconnect click only asks for confirmation");
    await act(async () => { rowButton(0, "确认断开")!.click(); });
    check(mailCalls.some((call) => call.command === "disconnect_qq_mail" && call.args.email === "demo@qq.com") && rows().length === 1,
      "Confirming disconnects and removes the mailbox");
    await type(formEmail(), "new@example.edu.cn");
    await type(element<HTMLInputElement>(".mail-settings__form input[type='password']"), "code");
    await type(element<HTMLInputElement>(".mail-settings__form input[type='text']"), "imap.example.edu.cn");
    await act(async () => { element<HTMLButtonElement>(".mail-settings__form button[type='submit']").click(); });
    check(mailCalls.some((call) => call.command === "connect_qq_mail" && call.args.host === "imap.example.edu.cn") && rows().length === 2,
      "Adding a mailbox sends the typed server and lists it");
    const saved = JSON.parse(localStorage.getItem("focusd-island-qq-mail-settings") ?? "{}") as { accounts?: { email: string; host: string }[] };
    check(saved.accounts?.some((account) => account.email === "new@example.edu.cn" && account.host === "imap.example.edu.cn"),
      "The typed server is saved with the mailbox");

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
