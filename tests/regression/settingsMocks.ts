// The Tauri commands the settings window calls, answered as the island would, for the settings
// regression pages. Importing this installs the mocks; the arrays record what was called.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { MailSnapshot } from "../../src/features/messages/mail/api";

let revision = 0;
export const commands: string[] = [];
export const mailCalls: { command: string; args: Record<string, unknown> }[] = [];
const mailbox = (email: string, extra: Partial<MailSnapshot> = {}): MailSnapshot => ({
  revision: ++revision, email, configured: true, enabled: true, syncing: false, status: "connected",
  unreadCount: 2, items: [], lastSyncedAt: 0, error: null, ...extra,
});
let mailboxes: MailSnapshot[] = [mailbox("demo@qq.com"), mailbox("louis@163.com", { status: "authRequired", enabled: false, unreadCount: null })];
let replyMarkerOn = false;
export const REPLY_MARKER = { path: "C:\\Users\\demo\\.claude\\rules\\focusd-island-reply-marker.md", content: "<!-- focusd-island: reply marker v2 -->\n## Reply status marker" };
const replyMarker = () => ({ installed: replyMarkerOn, outdated: false, ...REPLY_MARKER });
export const replyMarkerCalls: boolean[] = [];
export const translationShortcutCalls: string[] = [];
// Kept like the native store, so a page opened again reads back what was saved.
let clipboardSettings = { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: true };
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "get_reply_marker_state": return replyMarker();
    case "set_reply_marker": replyMarkerCalls.push(replyMarkerOn = Boolean(args.enabled)); return replyMarker();
    // Two players open, NetEase playing; Spotify is in the saved order but not open.
    case "get_media_state": return { sessions: [{ id: "QQMusic", label: "QQ音乐", playing: false }, { id: "cloudmusic.exe", label: "网易云音乐", playing: true }] };
    case "get_launch_at_startup": return false;
    case "set_launch_at_startup": return null;
    case "get_default_todo_save_directory": return "";
    case "get_clipboard_history": return { settings: clipboardSettings, items: [] };
    case "set_clipboard_history_settings":
      clipboardSettings = { ...clipboardSettings, ...(args.settings as object | undefined) };
      return { settings: clipboardSettings, items: [] };
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
    case "get_wechat_reminder_state":
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: args.enabled ?? true, status: args.enabled === false ? "disabled" : "listening", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", messages: [] };
    case "has_translation_secret": return args.provider === "deepseek";
    case "set_translation_shortcut":
      translationShortcutCalls.push(String(args.shortcut));
      // Taken by another program, as Windows would answer.
      if (args.shortcut === "Ctrl+Alt+Q") throw "快捷键 Ctrl+Alt+Q 已被占用或无法注册：热键已被注册。";
      return args.shortcut;
    case "updater_configured": return true;
    case "get_updater_proxy": return null;
    case "plugin:app|version": return "0.0.0-test";
    case "get_agent_hooks_state": return { codex: "notInstalled", claudeCode: "notInstalled", scriptsOutdated: false };
    case "list_sound_packs": return [{ id: "chimes-1", name: "Chimes", author: "Ann", license: "CC0-1.0", sounds: { complete: "complete.wav", error: "error.wav" } }];
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("settings");
