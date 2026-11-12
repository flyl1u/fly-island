// pnpm dev, then open /tests/i18n.html?test=1. Omit ?test=1 for interactive QA.
// The island and the settings window share one page and one I18nProvider here.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { IslandApp } from "../../src/windows/island/IslandApp";
import { TranslationWindow } from "../../src/windows/translation/TranslationWindow";
import { SettingsWindow } from "../../src/windows/settings/SettingsWindow";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS, useLocale } from "../../src/i18n";

const query = new URLSearchParams(location.search);
const automated = query.has("test");
const translation = query.has("translation");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: automated });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
const restore = () => {
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("focusd-island-"))) {
    if (!original.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of original) localStorage.setItem(key, value);
};
window.addEventListener("beforeunload", restore);

const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
if (!translation) {
  if (automated || localStorage.getItem(LOCALE_STORAGE_KEY) === null) localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
  localStorage.setItem("focusd-island-current-date", date);
  localStorage.setItem("focusd-island-todos", JSON.stringify([{ id: "i18n-task", title: "保留用户任务 Привет", completed: false, createdAt: now.getTime() }]));
  localStorage.setItem("focusd-island-daily-note", "用户的中文笔记");
  localStorage.setItem("focusd-island-archives", JSON.stringify([{ date: "2026-10-21", todos: [], dailyNote: "历史笔记", savedAt: now.getTime(), savedToDisk: false }]));
  localStorage.setItem("focusd-island-save-directory", "");
  localStorage.setItem("focusd-island-qq-notification-access-requested", "true");
}
let revision = 0;
let reads = 0;
// The translation window pastes this on open; emptied before its empty-source check.
let clipboardText = "用户复制的文本";
const commands: string[] = [];
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "get_launch_at_startup": return false;
    case "get_default_todo_save_directory": return "";
    case "get_clipboard_history": return { settings: { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+X", shortcutEnabled: true }, items: [] };
    // The island polls these every second; null would end the run when the checks take longer.
    case "list_agent_sessions": return [];
    case "list_plugin_views": return { views: [], status: [] };
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "" };
    // Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
    case "get_media_state": return { available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable", title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0, canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false, repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null, sessions: [], updatedAt: 0 };
    case "get_audio_level": return { active: false, peak: 0, updatedAt: 0 };
    case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
    case "set_island_interaction": return "disabled";
    case "set_qq_notifications_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", items: [], error: null };
    case "get_wechat_reminder_state":
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: args.enabled ?? true, status: args.enabled === false ? "disabled" : "listening", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [] };
    case "get_qq_mail_state": return [{ revision: ++revision, email: "test@qq.com", configured: true, enabled: true, syncing: false, status: "connected", unreadCount: 1, items: [{ id: "mail:1", uid: 1, sender: "原始发件人", subject: "保留邮件主题", receivedAt: now.getTime(), unread: true }], lastSyncedAt: now.getTime(), error: null }];
    case "read_qq_mail": ++reads; return { id: args.messageId, content: "<script>removed</script>", contentType: "text/html" };
    case "has_translation_secret": return false;
    case "set_translation_shortcut": return args.shortcut;
    case "read_translation_clipboard": return clipboardText;
    case "plugin:window|is_visible": return true;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows(translation ? "translation" : "main");

let changeLocale: ReturnType<typeof useLocale>["setLocale"];
function Fixture() {
  const { setLocale } = useLocale();
  changeLocale = setLocale;
  return translation ? <TranslationWindow /> : <><IslandApp /><SettingsWindow /></>;
}
const root = createRoot(document.getElementById("root")!);
const mount = () => root.render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>);
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const click = async (selector: string) => {
  const element = document.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  await act(async () => { element.click(); });
};
// The language row's dropdown is named by its row title in whichever language is showing.
const LANGUAGE_TRIGGER = [TRANSLATIONS["zh-CN"], TRANSLATIONS.en]
  .map((text) => `.settings-select .select-control__trigger[aria-label='${text.settings.language.label}']`)
  .join(", ");
const switchTo = async (locale: string) => {
  await click(LANGUAGE_TRIGGER);
  const menu = document.querySelector(LANGUAGE_TRIGGER)?.closest(".select-control");
  const option = menu?.querySelector<HTMLElement>(`.select-control__option[data-value='${locale}']`);
  if (!option) throw new Error(`Missing language option ${locale}`);
  await act(async () => { option.click(); });
};

if (!automated) mount();
else {
  try {
    await act(async () => { mount(); });
    await click(".island__open-button");
    check(document.querySelector(LANGUAGE_TRIGGER)?.getAttribute("aria-label") === "界面语言", "Chinese language control is reachable");
    const dataKeys = ["focusd-island-todos", "focusd-island-daily-note", "focusd-island-archives", "focusd-island-settings", "focusd-island-setting-presets"];
    const dataBefore = dataKeys.map(key => localStorage.getItem(key));
    const subscriptionsBefore = commands.filter(command => command.startsWith("set_qq_") || command === "set_wechat_reminders_enabled").length;
    await switchTo("en");
    check(document.documentElement.lang === "en" && localStorage.getItem(LOCALE_STORAGE_KEY) === "en", "Language changes immediately and persists");
    check(document.querySelector(".settings-sidebar")?.textContent?.includes("Appearance"), "Settings categories are translated");
    await click(".settings-sidebar__item[data-category='appearance']");
    check(document.querySelector(".editor-panel")?.textContent?.includes("Collapsed size") && document.querySelector(".editor-panel")?.textContent?.includes("Expanded size"), "Current size and font settings are translated");
    await click(".settings-sidebar__item[data-category='general']");
    check(dataKeys.every((key, index) => localStorage.getItem(key) === dataBefore[index]), "Switching keeps tasks, notes, settings, and custom presets unchanged");
    check(commands.filter(command => command.startsWith("set_qq_") || command === "set_wechat_reminders_enabled").length === subscriptionsBefore, "Switching does not reconnect notification receivers");
    await act(async () => { changeLocale!("constructor" as "en"); });
    check(document.documentElement.lang === "en", "Invalid locale cannot break the mounted interface");
    await click(".dot-button--todo");
    check(document.querySelector(".todo-title")?.textContent?.includes("保留用户任务 Привет"), "User task content stays as written");
    check(document.querySelectorAll(".todo-spine-button").length === 0, "The obsolete today, save and archive buttons are removed");
    await click(".todo-view-switch__segment[data-view='daily']");
    check(document.querySelector(".daily-note")?.getAttribute("aria-label") === TRANSLATIONS.en.notebook.dailyNoteLabel, "Daily notes follow the selected language");
    check(document.querySelector(".todo-view-switch__segment--active")?.textContent === "Notes", "The todo view switch is translated");
    await click(".todo-view-switch__segment[data-view='today']");
    check(document.querySelectorAll("[title]").length === 0, "No hover tooltips on the island");
    await click("button.dot-button--messages[aria-label^='Messages']");
    check(document.querySelector(".qq-panel__empty")?.textContent?.includes("No messages"), "QQ panel uses English copy");
    await click(".message-sources button[aria-label='WeChat reminders']");
    check(document.querySelector(".qq-panel__empty")?.textContent?.includes("No reminders"), "WeChat panel uses English copy");
    await click(".message-sources button[aria-label='Mail']");
    check(document.querySelector(".qq-mail-list")?.textContent?.includes("保留邮件主题"), "Mail subjects stay as written");
    await click("button[data-mail-id='mail:1']");
    check(document.querySelector(".qq-mail-body")?.textContent?.includes("No text to display"), "Sanitized empty HTML mail has a translated fallback");
    await switchTo("zh-CN");
    check(document.documentElement.lang === "zh-CN" && reads === 1, "Switching back keeps mail requests stable");
    await act(async () => { localStorage.setItem(LOCALE_STORAGE_KEY, "en"); window.dispatchEvent(new StorageEvent("storage", { key: LOCALE_STORAGE_KEY, newValue: "en", storageArea: localStorage })); });
    check(document.documentElement.lang === "en", "The provider accepts language changes from another window");
    await act(async () => { root.unmount(); });
    clipboardText = "";
    const translationRoot = createRoot(document.getElementById("root")!);
    await act(async () => { translationRoot.render(<I18nProvider><TranslationWindow /></I18nProvider>); });
    check(document.querySelector("h1")?.textContent === "Quick translation", "A fresh translation window loads the persisted language");
    await click(".translation-window__translate");
    check(document.querySelector("[role='alert']")?.textContent?.includes("Enter source text"), "Translation validation follows the interface language");
    await act(async () => { translationRoot.unmount(); });
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
