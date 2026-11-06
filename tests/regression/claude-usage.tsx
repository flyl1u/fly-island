// pnpm dev, then open /tests/regression/claude-usage.html (demo, card open) or ?test=1 (checks).
import { act, StrictMode, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import { ClaudeUsageGauge } from "../../src/features/claude-usage/ClaudeUsageGauge";
import type { AgentUsage } from "../../src/features/agent-status/api";
import { CLAUDE_USAGE_GAUGE_WIDTH, USAGE_COLORS } from "../../src/features/claude-usage/usageRing";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/WeChatReminders";
import { useMail } from "../../src/features/messages/mail/MailPanel";
import type { MediaState } from "../../src/features/media/api";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const automated = new URLSearchParams(location.search).has("test");
// Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
const UNAVAILABLE_MEDIA: MediaState = {
  available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable",
  title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0,
  canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false,
  repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null,
  sessions: [], updatedAt: 0,
};
const keys = ["focusd-island-qq-notifications-enabled", "focusd-island-wechat-reminders-enabled", "focusd-island-qq-mail-settings"];
const originals = keys.map((key) => localStorage.getItem(key));
keys.forEach((key) => localStorage.removeItem(key));
window.addEventListener("beforeunload", () => {
  keys.forEach((key, index) => originals[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, originals[index]!));
});

const MINUTE = 60_000;
const at = (minutes: number) => Date.now() + minutes * MINUTE;
// Shaped like AgentUsage in src-tauri/src/agent_status/usage.rs.
const snapshot = (overrides: Partial<AgentUsage> = {}): AgentUsage => ({
  updatedAt: Date.now() - 2 * MINUTE,
  fiveHour: { name: "", used: 42, resetsAt: at(132.5) },
  sevenDay: { name: "", used: 76, resetsAt: at(3 * 1440 + 4 * 60 - 0.5) },
  models: [],
  plan: null,
  ...overrides,
});
let current: AgentUsage | null = snapshot();
let reads = 0;
let refreshes = 0;
mockIPC((command) => {
  if (command === "refresh_claude_usage") {
    refreshes += 1;
    return;
  }
  if (command === "get_qq_mail_state") return [{
    revision: 0, email: "", configured: false, enabled: false, syncing: false,
    status: "disabled", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
  }];
  if (command === "get_agent_usage") {
    reads += 1;
    return current;
  }
}, { shouldMockEvents: true });

function Fixture() {
  const qq = useQQNotifications(true);
  const wechat = useWeChatReminders(true);
  const qqMail = useMail(true);
  return <div className="stage" style={{ "--collapsed-island-width": `${280 + CLAUDE_USAGE_GAUGE_WIDTH}px` } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={{ notification: null, dismiss: () => {}, runAction: () => {} }}
      mode="collapsed" page="todo" isTucked={false} isDetached={true} showTitle={false}
      showCollapsedText={true} collapsedTaskTitle="剩余3个待办" collapsedTodoCount={null} agentSession={null} activeAgentSessionCount={0}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: false, clipboard: true, shelf: true, qq: false, wechat: false, qqMail: false, agents: false, translation: false }}
      shelfCount={null} collapsedSlots={{ gauges: <ClaudeUsageGauge />, sideWidth: CLAUDE_USAGE_GAUGE_WIDTH }}
      onOpenPage={() => {}} onOpenMessages={() => {}}
      onPageChange={() => {}} onWindowDragStart={() => {}} onCollapse={() => {}}
      onResetPosition={() => {}} minimizesToTray onMinimize={() => {}} onOpenSettings={() => {}} onOpenTranslator={() => {}} translationPeek={null} onOpenTranslationPeek={() => {}} onTuck={() => {}} onReveal={() => {}} pageDigitModifiers="Alt">
      <span>待办清单</span>
    </IslandShell>
  </div>;
}

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const button = () => document.querySelector<HTMLButtonElement>(".island__gauge-slot .claude-usage-gauge")!;
const anchor = () => button().parentElement!;
const card = () => document.querySelector<HTMLElement>(".island-hover-card");
const arcColors = () => [...button().querySelectorAll(".mini-ring__arc")].map((arc) => arc.getAttribute("stroke"));
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
// A click re-reads the snapshot, so a new one shows without waiting for the 30-second timer.
const push = async (next: AgentUsage | null) => {
  current = next;
  await act(async () => button().click());
  await wait(20);
};
const hover = async () => {
  await act(async () => { anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); });
  await wait(260);
};
const leave = () => act(async () => { anchor().dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body })); });
const results = document.getElementById("results")!;

async function runChecks() {
  try {
    await wait(50);
    check(button() && button().nextElementSibling === null && anchor().parentElement?.classList.contains("island__gauge-slot"), "用量环在仪表槽位里，是一个按钮");
    check(!button().title && !button().querySelector("[title]"), "不用原生 title 提示");
    check(button().querySelectorAll(".mini-ring__track").length === 2, "同心双环：两条底轨");
    check(arcColors().join() === [USAGE_COLORS.normal, USAGE_COLORS.warn].join(), "外环 42% 常态色，内环 76% 用 ≥70% 的颜色");

    await act(async () => { anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); });
    await wait(100);
    check(!card(), "停留不到 200ms 不出现卡片");
    await wait(160);
    const island = document.querySelector(".island")!.getBoundingClientRect();
    const box = card()!.getBoundingClientRect();
    check(card()!.closest(".stage") && !card()!.closest(".island"), "卡片画在舞台里、岛外面");
    check(box.top >= island.bottom && Math.abs(box.left + box.width / 2 - (island.left + island.width / 2)) < 1.5, "卡片在胶囊正下方居中");
    check(getComputedStyle(card()!).pointerEvents === "none", "卡片不接收鼠标");
    const lines = [...card()!.querySelectorAll(".island-hover-card__line")].map((line) => line.textContent);
    check(lines[0] === "5 小时 42% · 2 小时 13 分后重置" && lines[1] === "7 天 76% · 3 天 4 小时后重置" && lines[2] === "2 分钟前更新 · 来自 claude-hud", `卡片内容：${lines.join(" / ")}`);
    await leave();
    check(!card(), "移开后卡片消失");

    await push(snapshot({ source: "api", error: { kind: "loginRequired", message: "HTTP 401" } }));
    check(arcColors().join() === [USAGE_COLORS.normal, USAGE_COLORS.warn].join(), "直接查询失败但数据仍新鲜时，环不变灰");
    await hover();
    const failedLines = [...card()!.querySelectorAll(".island-hover-card__line")].map((line) => line.textContent);
    check(failedLines[2] === "需要在 Claude Code 里重新登录" && failedLines[3] === "2 分钟前更新 · 来自 Anthropic", `卡片写出失败原因和来源：${failedLines.join(" / ")}`);
    await leave();

    await push(snapshot({ updatedAt: Date.now() - 20 * MINUTE }));
    check(arcColors().every((color) => color === USAGE_COLORS.stale), "超过 15 分钟的数据整体变灰");
    await push(null);
    check(button().querySelectorAll(".mini-ring__arc").length === 0 && button().querySelectorAll(".mini-ring__track").length === 2, "没有 claude-hud 快照时只显示灰色底轨");
    await hover();
    check(card()?.textContent === "暂无 Claude 用量（需要本机的 magpie 网关、claude-hud 的用量快照，或在插件设置里打开「直接向 Anthropic 查询」）", "卡片说明数据从哪来");
    await leave();

    const before = { reads, refreshes };
    await act(async () => button().click());
    await wait(20);
    check(refreshes === before.refreshes + 1 && reads === before.reads + 1, "点击环先请求刷新，再重新读取用量");
    await act(async () => button().focus({ focusVisible: true } as FocusOptions));
    if (button().matches(":focus-visible")) check(card(), "键盘聚焦时也显示卡片");
    await act(async () => button().blur());
    check(!card(), "失去焦点后卡片消失");

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
    console.error(error);
  }
}

await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><Fixture /></StrictMode>); });
if (automated) await runChecks();
else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  await new Promise((resolve) => setTimeout(resolve, 50));
  anchor().dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  results.textContent = "演示：仪表槽位里的用量同心双环（外 5 小时、内 7 天）和悬停卡片。加 ?test=1 运行检查。";
}
