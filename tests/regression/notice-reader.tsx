// The real island: adaptive layout, native IPC size, selectable mail bodies and quiet previews.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { IslandApp } from "../../src/windows/island/IslandApp";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import type { MailContent, MailSnapshot } from "../../src/features/messages/mail/api";
import type { IslandInteraction } from "../../src/windows/island/api";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const params = new URLSearchParams(location.search);
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
window.addEventListener("beforeunload", () => {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("focusd-island-"))) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
});
for (const key of original.keys()) localStorage.removeItem(key);
localStorage.setItem(LOCALE_STORAGE_KEY, params.get("lang") === "en" ? "en" : "zh-CN");
let settings = { messageAutoExpand: true, messageExpandMaxWidth: 520, messageExpandMaxHeight: 160,
  messageExpandSeconds: 60, gameShowNotices: false, gameDoNotDisturb: true, gameAutoTuck: true,
  autoTuck: false, autoCollapseSeconds: 0, revealOnMessage: false, agentStatusEnabled: false,
  musicEnabled: false, shelfEnabled: false, colorScheme: params.get("theme") ?? "dark",
  collapsedScale: Number(params.get("scale") ?? 1), islandFontPercent: 120 };
localStorage.setItem("focusd-island-settings", JSON.stringify(settings));
let revision = 0;
const calls: { command: string; args: Record<string, unknown> }[] = [];
let latestNative: IslandInteraction | null = null;
let mail: MailSnapshot = { revision: 0, email: "test@qq.com", configured: true, enabled: true, syncing: false,
  status: "connected", unreadCount: 0, items: [], lastSyncedAt: null, error: null };
const fullText = "订单 A-123456，地址：三楼会议室。链接 https://example.com/order\n".repeat(20);
let read: (id: string) => Promise<MailContent> = async (id) => ({ id, contentType: "text/html", attachments: [],
  content: `<p>订单 A-123456 &amp; 发布安排</p><p>${fullText}</p><script>unsafe text</script><img src="https://example.invalid/pixel">` });
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  switch (command) {
    case "set_island_interaction": latestNative = args as IslandInteraction; return "disabled";
    case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
    case "get_island_top_attachment": return true;
    case "get_qq_mail_state": return [mail];
    case "read_qq_mail": return read(String(args.messageId));
    case "get_media_state": return DEFAULT_MEDIA_STATE;
    case "get_clipboard_history": return { settings: { enabled: false, captureImages: true, maxItems: 30, shortcut: "Ctrl+Shift+V", shortcutEnabled: false }, items: [] };
    case "get_file_shelf": return { items: [] };
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "" };
    case "list_agent_sessions": case "agent_sessions_in_front": case "agent_approval_pending": return [];
    case "set_qq_notifications_enabled": case "get_qq_notification_state": return { revision: ++revision, enabled: true, status: "listening", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: false, status: "disabled", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", messages: [] };
    case "request_qq_notification_access": return "allowed";
    case "updater_configured": case "has_translation_secret": return false;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("main");
const root = createRoot(document.getElementById("root")!);
const checks: string[] = [];
const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); checks.push(`PASS ${label}`); };
const native = () => latestNative!;
const body = () => document.querySelector<HTMLElement>(".message-notice__body")!;
const click = (selector: string) => act(async () => { document.querySelector<HTMLElement>(selector)!.click(); });
const configure = (patch: Partial<typeof settings>) => act(async () => {
  settings = { ...settings, ...patch };
  localStorage.setItem("focusd-island-settings", JSON.stringify(settings));
  window.dispatchEvent(new StorageEvent("storage", { key: "focusd-island-settings" }));
});
const qq = async (text: string) => act(async () => {
  await emit("qq-notifications-changed", { snapshot: { revision: ++revision, enabled: true, status: "listening", items: [{ id: String(revision), title: "项目组", body: text, createdAt: Date.now() }], error: null }, newestId: String(revision), windowVisible: true });
});
const arrive = async (id: string) => act(async () => {
  mail = { ...mail, revision: ++revision, unreadCount: 1, items: [{ id, uid: revision, sender: "订单团队", subject: `订单确认 ${id}`, unread: true, receivedAt: Date.now() }] };
  await emit("qq-mail-changed", { snapshot: mail, newestId: id, windowVisible: true });
});
const settle = async () => {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    if (!document.querySelector(".island")!.getAnimations({ subtree: true }).some((animation) => animation.playState === "running")) return;
  }
  throw new Error("Notice animation did not settle");
};
try {
  await act(async () => root.render(<StrictMode><I18nProvider><IslandApp /></I18nProvider></StrictMode>));
  await configure({ pulseColor: "#FF3366" } as Partial<typeof settings>);
  check(getComputedStyle(document.querySelector(".island__pulse")!).backgroundColor === "rgb(255, 51, 102)", "亮点颜色跟随设置并实时生效");
  await qq("好的");
  check(body() && !body().closest("button") && getComputedStyle(body()).userSelect === "text" && native().noticeWidth !== null,
    "短消息（微信 / QQ）也用可选中的阅读器，不再是一点就跳转的按钮");
  // As in the app: status icons beside the text take room the estimate leaves out. A message a bit
  // longer than the island must still grow it until nothing is cut off (v3.4.0 user report).
  await configure({ musicEnabled: true, shelfEnabled: true, agentStatusEnabled: true });
  await qq("好的");
  await settle();
  const baseWidth = document.querySelector<HTMLElement>(".island")!.getBoundingClientRect().width;
  await qq("明天下午三点在三楼会议室开项目评审会，请准备材料");
  await settle();
  // Either it fits one wider line, or past the width limit it turns into the reader.
  const slot = document.querySelector<HTMLElement>(".island__text-slot");
  const clipped = slot ? [slot, ...slot.querySelectorAll<HTMLElement>("*")].some((element) => element.scrollWidth - element.clientWidth > 4) : !body();
  check(document.querySelector<HTMLElement>(".island")!.getBoundingClientRect().width > baseWidth && !clipped
    && native().noticeWidth !== null, "比岛长的消息撑大岛屿，文字不再被截断");
  await configure({ musicEnabled: false, shelfEnabled: false, agentStatusEnabled: false });
  await qq(fullText);
  await settle();
  check(body() && native().noticeWidth! <= 520 && native().noticeHeight === 160, "长消息长到设定上限，并同步原生宽高");
  const island = document.querySelector<HTMLElement>(".island")!.getBoundingClientRect();
  check(Math.abs(island.width - native().noticeWidth! * settings.collapsedScale) < 1 && Math.abs(island.height - native().noticeHeight! * settings.collapsedScale) < 1,
    "实际显示尺寸与原生命中区一致");
  check(body().scrollHeight > body().clientHeight && getComputedStyle(body()).overflowY === "auto", "超出上限滚动阅读");
  await arrive("one");
  check(body().textContent?.includes("A-123456 & 发布安排") && !body().textContent?.includes("unsafe text") && !body().querySelector("img, script"), "邮件通知加载正文并清理主动内容和图片");
  const reads = calls.filter((call) => call.command === "read_qq_mail").length;
  const drags = calls.filter((call) => call.command === "start_island_drag").length;
  const range = document.createRange();
  range.selectNodeContents(body());
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  await act(async () => {
    body().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 300, clientY: 60 }));
    body().dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 450, clientY: 120 }));
    body().dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); body().click();
  });
  check(getComputedStyle(body()).userSelect === "text" && window.getSelection()!.toString().includes("A-123456")
    && calls.filter((call) => call.command === "read_qq_mail").length === reads
    && calls.filter((call) => call.command === "start_island_drag").length === drags && native().mode === "collapsed", "选择通知文字不拖窗口、不打开邮件");
  window.getSelection()!.removeAllRanges();
  check(!document.querySelector(".message-notice .copy-text-button") && !body().innerHTML.includes("<p>订单")
    && body().textContent?.includes("https://example.com/order"), "通知不放复制按钮，正文为可选中的纯文本");
  read = async () => { throw new Error("读取失败"); };
  await arrive("failed");
  check(body().querySelector("[role=alert]"), "正文加载失败时原地提示");
  read = async (id) => ({ id, content: "重试后的完整正文", contentType: "text/plain", attachments: [] });
  await click(".message-notice__status button");
  check(body().textContent?.includes("重试后的完整正文"), "正文加载失败可原地重试");
  await click(".message-notice__open");
  check(native().mode === "expanded" && document.querySelector(".qq-mail-reader__subject"), "独立打开按钮进入邮件阅读页");
  check(getComputedStyle(document.querySelector(".qq-mail-reader__subject")!).userSelect === "text", "邮件阅读页主题可选择");
  check(!document.querySelector(".qq-mail-reader__actions .copy-text-button"), "邮件页不加复制按钮，靠选中文字复制");
  await click(".island__quiet-button");
  await act(async () => emit("foreground-fullscreen-changed", { active: true, onIslandMonitor: true }));
  await qq(fullText);
  check(!document.querySelector(".message-notice"), "游戏模式通知默认关闭");
  await configure({ gameShowNotices: true });
  await qq(fullText);
  check(body() && native().clickThrough && native().mode === "collapsed" && !native().isTucked, "游戏通知开启后能从贴边弹出，并保持原生点击穿透");
  check(!calls.some((call) => call.command === "take_island_hover_focus"), "通知展示不请求悬停焦点");
  await configure({ gameShowNotices: false });
  check(!document.querySelector(".message-notice") && native().noticeWidth === null, "关闭游戏通知立即撤去预览并恢复尺寸");
  await act(async () => emit("foreground-fullscreen-changed", { active: false, onIslandMonitor: false }));
  if (params.has("view")) { await configure({ gameShowNotices: false }); await arrive("preview"); await settle(); }
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  checks.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
}
document.getElementById("results")!.textContent = checks.join("\n");
