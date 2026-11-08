// The Tauri commands the settings window calls, answered as the island would, for the settings
// regression pages. Importing this installs the mocks; the arrays record what was called.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { MailSnapshot } from "../../src/features/messages/mail/api";

let revision = 0;
export const commands: string[] = [];
export const revokedPermissions: string[] = [];
export const marketInstalls: Record<string, unknown>[] = [];
export const keybindingCalls: Record<string, unknown>[] = [];
export const mailCalls: { command: string; args: Record<string, unknown> }[] = [];
const mailbox = (email: string, extra: Partial<MailSnapshot> = {}): MailSnapshot => ({
  revision: ++revision, email, configured: true, enabled: true, syncing: false, status: "connected",
  unreadCount: 2, items: [], lastSyncedAt: 0, error: null, ...extra,
});
let mailboxes: MailSnapshot[] = [mailbox("demo@qq.com"), mailbox("louis@163.com", { status: "authRequired", enabled: false, unreadCount: null })];
let replyMarkerOn = false;
export const REPLY_MARKER = { path: "C:\\Users\\demo\\.claude\\rules\\focusd-island-reply-marker.md", content: "<!-- focusd-island: reply marker v2 -->\n## Reply status marker" };
const replyMarker = () => ({ installed: replyMarkerOn, outdated: false, ...REPLY_MARKER, remotes: [] });
export const replyMarkerCalls: boolean[] = [];
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "revoke_plugin_sensitive_permission") revokedPermissions.push(String(args.permission));
  if (command === "install_market_plugin") marketInstalls.push(args);
  // Answers with the plugin list, like the island does after saving the shortcut.
  if (command === "set_plugin_keybinding") {
    keybindingCalls.push(args);
    command = "list_plugins";
  }
  switch (command) {
    case "get_reply_marker_state": return replyMarker();
    case "set_reply_marker": replyMarkerCalls.push(replyMarkerOn = Boolean(args.enabled)); return replyMarker();
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
        { id: "dev.example.todo-sync", name: { "zh-CN": "待办同步示例", en: "Todo sync example" }, description: null, version: "1.1.0", apiVersion: 1, minAppVersion: null, author: "FocuSD", homepage: "", permissions: ["todos:read"], runtime: "powershell", download: { url: "https://example.com/a.zip", sha256: "0".repeat(64), size: 1 }, publisher: null, repo: "TixXin/fly-island", categories: ["todos", "productivity"], readme: "# 待办同步\n\n每 **5 分钟**同步一次，见 [文档](https://example.com/docs)。\n\n- 读取待办\n- 写入日志", changelog: "## 1.1.0\n\n- 新增同步间隔设置", installedVersion: "1.0.0", incompatible: null, revoked: null, signedBy: "0123456789abcdef", signingKeyChanged: true },
        { id: "dev.example.new", name: { "zh-CN": "新插件", en: "New plugin" }, description: { "zh-CN": "还没安装。", en: "Not installed yet." }, version: "0.1.0", apiVersion: 1, minAppVersion: null, author: "", homepage: "", permissions: [], runtime: "node", download: { url: "https://example.com/b.zip", sha256: "0".repeat(64), size: 1 }, publisher: "someone-with-a-long-github-name", repo: null, categories: ["developer"], installedVersion: null, incompatible: null, revoked: null, signedBy: null, signingKeyChanged: false, verified: { via: "domain", domain: "plugins.example.com" } },
      ],
    };
    case "list_plugins": {
      const base = { dev: false, notificationsMuted: false, keybindingConflicts: [], keybindings: {}, optionalPermissions: [], calls: [], sensitive: {}, activation: "startup", activationEvents: [], startupMs: null, resources: null, keepAlive: null, revoked: null, updateAvailable: null, autoUpdated: null, preRelease: false, preReleaseAvailable: null, memoryLimitMb: 512, signingKeyChanged: false, authorKey: null };
      return {
      allowThirdParty: true,
      nodeAvailable: false,
      autoUpdate: false,
      trustedPublishers: ["someone"],
      pluginsDir: "C:\\Users\\demo\\AppData\\Roaming\\com.focusd.island\\plugins",
      plugins: [
        { ...base, id: "focusd.local-api", builtin: true, invalidReason: null, name: { "zh-CN": "本地接口", en: "Local API" }, description: { "zh-CN": "让脚本通过 HTTP 读写待办。", en: "Lets scripts read and change todos over HTTP." }, version: "1.0.0", author: "FocuSD", homepage: "", permissions: ["todos:read", "todos:write"], commands: [{ id: "reset-token", title: { "zh-CN": "重新生成令牌", en: "Regenerate token" } }], runtime: "builtin", hasProcess: true, enabled: true, needsApproval: false, status: "running", error: null, log: [], settingsSchema: [{ key: "allowWrite", type: "boolean", title: { "zh-CN": "允许修改", en: "Allow changes" }, default: false }], settings: { allowWrite: false }, info: [{ label: { "zh-CN": "地址", en: "Address" }, value: "http://127.0.0.1:39271/v1", copy: true, secret: false }, { label: { "zh-CN": "访问令牌", en: "Access token" }, value: "0".repeat(64), copy: true, secret: true }] },
        { ...base, activation: "onDemand", activationEvents: ["onCommand:sync-now", "onUri"], sensitive: { uri: "allowed" }, preReleaseAvailable: "1.1.0-beta.1", startupMs: 120, resources: { memoryBytes: 24 * 1024 * 1024, runtimeBytes: 20 * 1024 * 1024, processes: [{ name: "node.exe", memoryBytes: 24 * 1024 * 1024, workingSetBytes: 31 * 1024 * 1024 }], cpuPercent: 0.4, highCpu: false }, id: "dev.example.todo-sync", builtin: false, invalidReason: null, name: { "zh-CN": "待办同步示例", en: "Todo sync example" }, description: { "zh-CN": "每 5 分钟把待办数量写进日志，同步完成后可以在岛上提醒，也可以读取剪贴板里的待办文本并自动拆成多条待办。这段描述故意写长，用来检查两行截断。", en: "Logs the todo count every 5 minutes, can notify on the island after a sync, and can read todo text from the clipboard and split it into several todos. Long on purpose to check the two-line clamp." }, version: "1.0.0", author: "FocuSD", homepage: "https://github.com/flyl1u/fly-island", permissions: ["todos:read", "todos:write", "notes:write", "island:notify", "clipboard:read"], commands: [{ id: "sync-now", title: { "zh-CN": "立即同步", en: "Sync now" }, keybinding: "Ctrl+Alt+S" }], runtime: "node", hasProcess: true, enabled: true, needsApproval: false, status: "running", error: null, log: ["started", "3 open todos"], settingsSchema: [{ key: "interval", type: "number", title: { "zh-CN": "同步间隔（分钟）", en: "Sync every (minutes)" }, min: 1, max: 60, default: 5 }, { key: "notify", type: "boolean", title: { "zh-CN": "同步后提醒", en: "Notify after sync" } }], settings: { interval: 5, notify: false }, info: [{ label: { "zh-CN": "上次同步", en: "Last sync" }, value: "10:30", copy: false, secret: false }, { label: { "zh-CN": "令牌", en: "Token" }, value: "abc123", copy: true, secret: true }] },
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
    case "list_ssh_hosts": return ["devbox", "nas"]; case "get_agent_remote_hosts": return [{ host: "devbox", fetchedAt: 0, error: null, fetching: false }];
    case "get_agent_hooks_state": return { codex: "notInstalled", claudeCode: "notInstalled", scriptsOutdated: false };
    case "list_sound_packs": return [{ id: "chimes-1", name: "Chimes", author: "Ann", license: "CC0-1.0", sounds: { complete: "complete.wav", error: "error.wav" } }];
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("settings");
