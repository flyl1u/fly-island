import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import { IslandApp } from "../src/windows/island/IslandApp";
import { SettingsWindow } from "../src/windows/settings/SettingsWindow";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../src/i18n";

const automated = false;
const translation = false;
let setDetachedWindow: (value: boolean) => void;
Object.assign(globalThis, { isTauri: true });
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
const commands: string[] = [];
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "open_settings_window": setDetachedWindow(true); return null;
    case "dock_settings_window": setDetachedWindow(false); void emit("settings-open-requested"); return null;
    case "get_launch_at_startup": return false;
    case "get_default_todo_save_directory": return "";
    case "get_clipboard_history": return { settings: { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+X", shortcutEnabled: true }, items: [] };
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "" };
    // Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
    case "get_media_state": return { available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable", title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0, canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false, repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null, sessions: [], updatedAt: 0 };
    case "get_audio_level": return { active: false, peak: 0, updatedAt: 0 };
    case "set_island_interaction": return "disabled";
    case "set_qq_notifications_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: args.enabled, status: args.enabled ? "listening" : "disabled", pending: false, lastAttentionAt: null, error: null };
    case "get_qq_mail_state": return { revision: ++revision, email: "test@qq.com", configured: true, enabled: true, syncing: false, status: "connected", unreadCount: 1, items: [{ id: "mail:1", uid: 1, sender: "原始发件人", subject: "保留邮件主题", receivedAt: now.getTime(), unread: true }], lastSyncedAt: now.getTime(), error: null };
    case "read_qq_mail": ++reads; return { id: args.messageId, content: "<script>removed</script>", contentType: "text/html" };
    case "has_translation_secret": return false;
    case "set_translation_shortcut": return args.shortcut;
    case "read_translation_clipboard": return "用户复制的文本";
    case "plugin:window|is_visible": return true;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("main");


function Fixture() {
  const [detachedWindow, setWindow] = useState(false);
  setDetachedWindow = setWindow;
  return <><IslandApp />{detachedWindow && <div style={{position:"absolute",top:500,width:720,height:640}}><SettingsWindow /></div>}</>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>);
