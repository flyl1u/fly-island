// Stands in for the native side in the website demo: every command the island calls answers from
// the demo content, and the answers keep state (a starred clip stays starred, a read mail stays
// read, pause pauses), so a visitor can use the island as if it were installed. Nothing leaves the
// page: opening apps, files and links does nothing.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { DEFAULT_MEDIA_STATE } from "../src/features/media/mediaState";
import type { DemoContent } from "./demoData";

type Args = Record<string, unknown>;
type Clip = { id: string; kind: "text"; hash: string; createdAt: number; copiedAt: number; favorite: boolean; note?: string; preview: string; text: string };

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`)}`;

const COVERS = [
  svg('<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f6b26b"/><stop offset=".55" stop-color="#c2557a"/><stop offset="1" stop-color="#3b3a7a"/></linearGradient></defs>' +
    '<rect width="100" height="100" fill="url(#g)"/><circle cx="68" cy="34" r="20" fill="#ffe2a8" opacity=".85"/><path d="M0 78 Q30 58 55 76 T100 70 V100 H0Z" fill="#231942" opacity=".7"/>'),
  svg('<defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#7aa7ff"/><stop offset="1" stop-color="#1d2a55"/></linearGradient></defs>' +
    '<rect width="100" height="100" fill="url(#g)"/><rect x="18" y="20" width="64" height="14" rx="7" fill="#0b0d12"/><circle cx="30" cy="70" r="12" fill="#d7e3ff" opacity=".7"/>'),
];

export function installDemoMocks(data: DemoContent) {
  const now = Date.now();
  let revision = 1;

  const sessions = data.sessions.map((session, index) => ({
    provider: index === 0 ? "claudeCode" : "codex", sessionId: `s${index}`, cwd: session.cwd, title: session.title,
    model: index === 0 ? "Opus 5.5" : "gpt-6-astra", effort: index === 0 ? "high" : "medium",
    phase: ["running", "completed", "waiting"][index], lastMessage: session.message,
    updatedAt: now - [20_000, 6 * 60_000, 3 * 60_000][index], turnStartedAt: index === 0 ? now - 240_000 : null,
    permissionMode: "default", subagents: 0,
    host: index === 0 ? { name: "Windows Terminal", exe: null, kind: "terminal" } : { name: "Codex", exe: null, kind: "app" },
  }));
  const usage = (fiveHour: number, sevenDay: number, plan: string) => ({
    updatedAt: now, plan, models: [], source: "hud",
    fiveHour: { name: "", used: fiveHour, resetsAt: now + 2 * 3_600_000 },
    sevenDay: { name: "", used: sevenDay, resetsAt: now + 3 * 86_400_000 },
  });

  let clips: Clip[] = data.clips.map((clip, index) => ({
    id: `c${index}`, kind: "text", hash: `c${index}`, createdAt: now - index * 600_000, copiedAt: now - index * 600_000,
    favorite: Boolean("note" in clip && clip.note), note: "note" in clip ? clip.note : undefined, preview: clip.text, text: clip.text,
  }));
  const clipboard = () => ({
    settings: { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: true },
    items: clips,
  });
  const updateClip = (id: unknown, change: (clip: Clip) => Clip) => {
    clips = clips.map((clip) => (clip.id === id ? change(clip) : clip));
    return clipboard();
  };

  // Minutes ago, newest first: a busy afternoon rather than everything at once.
  const qqDelays = [1.5, 10, 25, 42, 68, 95, 140];
  let qqItems = data.qq.map((item, index) => ({ id: `q${index}`, ...item, createdAt: now - (qqDelays[index] ?? (index + 1) * 20) * 60_000 }));
  const qq = () => ({ revision: ++revision, enabled: true, status: "listening", error: null, items: qqItems });
  let wechatEnabled = true;
  let wechatPreviewEnabled = true;
  let wechatHideMinimizedTaskbar = false;
  let wechatPending = true;
  const wechatDelays = [0.75, 5, 15, 30, 48, 70, 105, 150, 200];
  let wechatMessages = data.wechat.map((item, index) => ({
    id: `wx${index + 1}`,
    contact: item.contact,
    body: item.body,
    receivedAt: now - (wechatDelays[index] ?? (index + 1) * 20) * 60_000,
  }));
  const wechat = () => ({
    revision: ++revision,
    enabled: wechatEnabled,
    status: wechatEnabled ? ("listening" as const) : ("disabled" as const),
    pending: wechatPending,
    lastAttentionAt: wechatMessages[0]?.receivedAt ?? null,
    error: null,
    previewEnabled: wechatPreviewEnabled,
    previewStatus: wechatPreviewEnabled ? ("ready" as const) : ("off" as const),
    hideMinimizedTaskbar: wechatHideMinimizedTaskbar,
    messages: wechatMessages,
  });
  // Minutes ago: today, yesterday and earlier in the week. Reading one marks only that one read.
  const mailDelays = [5, 40, 180, 26 * 60, 3 * 24 * 60];
  let mails = data.mail.map((item, index) => ({
    id: `mail:${index + 1}`, uid: index + 1, sender: item.sender, subject: item.subject,
    receivedAt: now - (mailDelays[index] ?? (index + 1) * 60) * 60_000, unread: item.unread,
  }));
  const mail = () => [{
    revision: ++revision, email: "demo@qq.com", configured: true, enabled: true, syncing: false, status: "connected",
    unreadCount: mails.filter((item) => item.unread).length, lastSyncedAt: now, error: null, items: mails,
  }];
  const mailBody = (id: unknown) => data.mail[mails.findIndex((item) => item.id === id)]?.body ?? "";

  // The player: two songs, a clock that runs while playing, previous / next and pause.
  let song = 0;
  let playing = true;
  let position = 66_000;
  let since = Date.now();
  const durations = [214_000, 188_000];
  const elapsed = () => (playing ? position + (Date.now() - since) : position) % durations[song];
  const media = () => {
    const current = data.songs[song];
    return {
      ...DEFAULT_MEDIA_STATE, available: true, audioActive: playing, playbackStatus: playing ? "playing" : "paused",
      title: current.title, artist: current.artist, album: current.album, thumbnail: COVERS[song],
      positionMs: elapsed(), durationMs: durations[song], canNext: true, canPrevious: true, canSeek: true,
      sourceApp: "Spotify", updatedAt: Date.now(),
    };
  };
  const switchSong = (step: number) => {
    song = (song + step + data.songs.length) % data.songs.length;
    position = 0;
    since = Date.now();
    playing = true;
    return media();
  };
  const lyrics = (title: unknown) => {
    const found = data.songs.find((item) => item.title === title) ?? data.songs[0];
    return found.lyrics.map((line, index) => `[${String(Math.floor((index * 5) / 60)).padStart(2, "0")}:${String((index * 5) % 60).padStart(2, "0")}.00]${line}`).join("\n");
  };

  const shelf = data.shelf.map((name, index) => ({
    id: `f${index}`, name, path: `D:\\Shelf\\${name}`, isDir: index === 2, size: [1_468_006, 284_112, 0][index],
    addedAt: now - 120_000, pinned: index === 0, missing: false, unreachable: false,
  }));

  mockIPC((command, payload) => {
    const args = (payload ?? {}) as Args;
    switch (command) {
      case "get_launch_at_startup": return false;
      case "get_default_todo_save_directory": return "D:\\Notes";
      case "save_todo_markdown": return { filePath: `D:\\Notes\\${String(args.date)}.md` };
      case "get_clipboard_history":
      case "set_clipboard_history_settings": return clipboard();
      case "copy_clipboard_history_item": return updateClip(args.id, (clip) => ({ ...clip, copiedAt: Date.now() }));
      case "toggle_clipboard_history_favorite": return updateClip(args.id, (clip) => ({ ...clip, favorite: !clip.favorite }));
      case "set_clipboard_history_item_note": return updateClip(args.id, (clip) => ({ ...clip, note: String(args.note ?? "") || undefined }));
      case "delete_clipboard_history_item": clips = clips.filter((clip) => clip.id !== args.id); return clipboard();
      case "delete_clipboard_history_items": clips = clips.filter((clip) => !(args.ids as string[]).includes(clip.id)); return clipboard();
      case "read_clipboard_history_image": throw new Error("No image in this demo.");
      case "clear_clipboard_history": clips = clips.filter((clip) => clip.favorite); return clipboard();
      case "get_file_shelf":
      case "set_file_shelf_options": return { items: shelf };
      case "toggle_file_shelf_pin": shelf.forEach((item) => { if (item.id === args.id) item.pinned = !item.pinned; }); return { items: shelf };
      case "list_agent_sessions": return sessions;
      case "agent_sessions_in_front":
      case "agent_approval_pending": return [];
      case "list_plugin_views": return { views: [], status: [] };
      case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "running", updatedAt: now }, updatedAt: now, statusPath: "" };
      case "get_agent_usage": return usage(38, 54, "Max");
      case "get_codex_usage": return usage(21, 47, "Pro");
      case "get_dsh_usage": return null;
      case "get_workbuddy_usage": return { status: "signedOut" };
      case "get_agent_hooks_state": return { claudeCode: "installed", codex: "installed" };
      case "get_reply_marker_state": return { installed: false, outdated: false, path: "", content: "" };
      case "get_media_state": return media();
      case "get_media_diagnostics": return { players: [] };
      case "media_play_pause": position = elapsed(); since = Date.now(); playing = !playing; return media();
      case "media_seek": position = Math.max(0, Number(args.positionMs) || 0); since = Date.now(); return media();
      case "media_next": return switchSong(1);
      case "media_previous": return switchSong(-1);
      case "get_audio_level": return { active: playing, peak: playing ? 0.4 + Math.random() * 0.4 : 0, updatedAt: Date.now() };
      case "get_lyrics": return { source: "lrclib", lrc: lyrics((args.query as { title?: string } | undefined)?.title) };
      case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
      case "set_island_interaction": return "disabled";
      case "get_island_top_attachment": return true;
      case "get_qq_notification_state":
      case "set_qq_notifications_enabled":
      case "request_qq_notification_access": return command === "request_qq_notification_access" ? "allowed" : qq();
      case "clear_qq_notifications": qqItems = []; return qq();
      case "dismiss_qq_contact": qqItems = qqItems.filter((item) => item.title !== args.title); return qq();
      case "dismiss_wechat_conversation": {
        const contact = wechatMessages.find((item) => item.id === args.messageId)?.contact;
        wechatMessages = wechatMessages.filter((item) => item.contact !== contact);
        return wechat();
      }
      case "open_wechat_conversation":
      case "launch_wechat_conversation":
        wechatPending = false;
        return true;
      case "open_wechat":
      case "launch_wechat":
        wechatPending = false;
        return wechat();
      case "clear_wechat_reminders":
      case "clear_wechat_messages":
      case "clear_wechat_notifications":
        wechatMessages = [];
        wechatPending = false;
        return wechat();
      case "get_wechat_reminder_state":
      case "set_wechat_reminders_enabled":
      case "set_wechat_message_preview_enabled":
      case "set_wechat_minimized_taskbar_hidden":
        if (typeof args.enabled === "boolean") wechatEnabled = args.enabled;
        if (typeof args.previewEnabled === "boolean") wechatPreviewEnabled = args.previewEnabled;
        if (typeof args.hideMinimizedTaskbar === "boolean") wechatHideMinimizedTaskbar = args.hideMinimizedTaskbar;
        if (typeof args.hidden === "boolean") wechatHideMinimizedTaskbar = args.hidden;
        return wechat();
      case "get_qq_mail_state": return mail();
      case "read_qq_mail": return { id: String(args.messageId), attachments: [], contentType: "text/plain", content: mailBody(args.messageId) };
      case "mark_qq_mail_read": mails = mails.map((item) => (item.id === args.messageId ? { ...item, unread: false } : item)); return mail()[0];
      case "set_qq_mail_enabled": return mail()[0];
      case "has_translation_secret": return true;
      case "translate_text": return new Promise((resolve) => {
        const text = String(args.text ?? "").trim();
        setTimeout(() => resolve(text === data.tour.translate ? data.tour.translated : data.translation.offline), 380);
      });
      case "set_translation_shortcut": return args.shortcut;
      case "read_translation_clipboard": return data.tour.translate;
      case "updater_configured": return false;
      case "list_sound_packs": return [];
      case "plugin:window|is_visible": return true;
      default: return null;
    }
  }, { shouldMockEvents: true });
  mockWindows("main");
}
