// Mock data for island-tour.tsx: every page of the island with believable content, so the
// tour shows what a user sees day to day rather than empty panels.
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import type { ClipboardHistorySnapshot } from "../../src/features/clipboard/api";
import type { FileShelfItem } from "../../src/features/file-shelf/api";
import type { MediaState } from "../../src/features/media/api";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";

const now = Date.now();
const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`)}`;

/** A cover with a warm gradient and a few shapes, so blur and tint have something to work with. */
export const COVER = svg(
  '<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f6b26b"/><stop offset=".55" stop-color="#c2557a"/><stop offset="1" stop-color="#3b3a7a"/></linearGradient></defs>' +
    '<rect width="100" height="100" fill="url(#g)"/><circle cx="68" cy="34" r="20" fill="#ffe2a8" opacity=".85"/><path d="M0 78 Q30 58 55 76 T100 70 V100 H0Z" fill="#231942" opacity=".7"/>',
);

export type TourMedia = "playing" | "paused" | "nocover" | "long" | "nolyrics" | "none";

const LONG_TITLE = "This Is a Very Long Song Title That Keeps Going (Live at the Royal Albert Hall, 2019 Remaster)";

export function tourMediaState(kind: TourMedia): MediaState {
  if (kind === "none") return { ...DEFAULT_MEDIA_STATE, updatedAt: now };
  return {
    ...DEFAULT_MEDIA_STATE,
    available: true,
    audioActive: kind !== "paused",
    playbackStatus: kind === "paused" ? "paused" : "playing",
    title: kind === "long" ? LONG_TITLE : kind === "nolyrics" ? "七里香" : "晴天",
    artist: kind === "long" ? "The Extraordinarily Long-Named Orchestra and Friends" : "周杰伦",
    album: "叶惠美",
    thumbnail: kind === "nocover" ? null : COVER,
    positionMs: 62_000,
    durationMs: 269_000,
    canNext: true,
    canPrevious: true,
    sourceApp: "QQ音乐",
    updatedAt: Date.now(),
  };
}

export const TOUR_LRC = [
  "[00:50.00]故事的小黄花",
  "[00:55.00]从出生那年就飘着",
  "[01:00.00]童年的荡秋千",
  "[01:05.00]随记忆一直晃到现在",
  "[01:10.00]吹着前奏望着天空",
  "[01:15.00]我想起花瓣试着掉落",
].join("\n");

export const TOUR_CLIPBOARD: ClipboardHistorySnapshot = {
  settings: { enabled: true, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: true },
  items: [
    { id: "c1", kind: "text", hash: "1", createdAt: now - 60_000, copiedAt: now - 60_000, preview: "pnpm tauri build --no-bundle", text: "pnpm tauri build --no-bundle" },
    { id: "c2", kind: "text", hash: "2", createdAt: now - 600_000, copiedAt: now - 600_000, favorite: true, note: "发票抬头", preview: "杭州某某科技有限公司 91330100MA2XXXXXXX", text: "杭州某某科技有限公司 91330100MA2XXXXXXX" },
    { id: "c3", kind: "text", hash: "3", createdAt: now - 3_600_000, copiedAt: now - 3_600_000, preview: "https://github.com/tauri-apps/tauri/issues/12345#issuecomment-2222222222-a-very-long-url-that-does-not-fit", text: "https://github.com/tauri-apps/tauri/issues/12345" },
    { id: "c4", kind: "text", hash: "4", createdAt: now - 7_200_000, copiedAt: now - 7_200_000, preview: "The quick brown fox jumps over the lazy dog", text: "The quick brown fox jumps over the lazy dog" },
  ],
};

const file = (id: string, name: string, extra: Partial<FileShelfItem> = {}): FileShelfItem => ({
  id, name, path: `D:\\Shelf\\${name}`, isDir: false, size: 1_468_006, addedAt: now - 120_000, pinned: false, missing: false, unreachable: false, ...extra,
});

export const TOUR_SHELF: FileShelfItem[] = [
  file("pdf", "季度报告.pdf", { pinned: true }),
  file("photo", "截图 2026-11-10.png", { size: 284_112 }),
  file("folder", "项目资料", { isDir: true, size: 0 }),
];

export const TOUR_SESSIONS: AgentSessionSummary[] = [
  {
    provider: "claudeCode", sessionId: "a", cwd: "E:\\Projects\\fly-island", title: "灵动岛外形重做",
    model: "Opus 5.5", effort: "medium", phase: "running", updatedAt: now - 20_000, turnStartedAt: now - 200_000,
    permissionMode: "default", subagents: 0, host: { name: "Windows Terminal", exe: null, kind: "terminal" },
    lastMessage: "正在跑回归页，稍后汇报结果。",
  },
  {
    provider: "codex", sessionId: "b", cwd: "E:\\Projects\\MioPicFlow", title: "恢复 Windows 发布机环境",
    model: "gpt-6-astra", effort: "high", phase: "waiting", updatedAt: now - 14 * 60_000, turnStartedAt: null,
    permissionMode: "default", host: { name: "Codex", exe: null, kind: "app" },
    lastMessage: "关闭系统代理后国内网站立即恢复，要我继续排查 Clash 吗？",
  },
];

export const TOUR_TODOS = [
  { id: "t1", title: "把音乐页重做一遍", completed: false, createdAt: now - 3_600_000 },
  { id: "t2", title: "回复设计评审邮件", completed: false, createdAt: now - 3_000_000 },
  { id: "t3", title: "跑一次完整回归", completed: true, createdAt: now - 2_000_000 },
];

export const TOUR_MAIL = [{
  revision: 1, email: "test@qq.com", configured: true, enabled: true, syncing: false, status: "connected", unreadCount: 1,
  items: [{ id: "mail:1", uid: 1, sender: "GitHub", subject: "[fly-island] Release v3.0.0 is ready for review", receivedAt: now - 300_000, unread: true }],
  lastSyncedAt: now, error: null,
}];

export const TOUR_QQ_ITEMS = [
  { id: "q1", title: "产品群", body: "明天上午十点评审，记得带上新的原型。", createdAt: now - 90_000 },
  { id: "q2", title: "小林", body: "收到，文件我放到共享盘了。", createdAt: now - 600_000 },
];
