// pnpm dev, then open /tests/regression/collapsed-slots.html (demo) or ?test=1 (checks).
import { act, StrictMode, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import type { CollapsedSlots } from "../../src/windows/island/types";
import { MiniRing } from "../../src/components/MiniRing";
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
mockIPC((command) => {
  if (command === "get_qq_mail_state") return [{
    revision: 0, email: "", configured: false, enabled: false, syncing: false,
    status: "disabled", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
  }];
}, { shouldMockEvents: true });

type State = { slots?: CollapsedSlots; task: string | null; agents: boolean; count: number; agentTitle?: string };
const usageRing = <MiniRing rings={[{ value: 0.62, color: "#7ccfff" }, { value: 0.28, color: "#b9a6ff" }]} ariaLabel="5 小时 62%，7 天 28%" title="5 小时 62%，7 天 28%" />;
const sessionRing = <MiniRing segments={[{ value: 0.5, color: "#5ad19a" }, { value: 0.25, color: "#f5c46b" }, { value: 0.25, color: "#ff8a80" }]} size={22} label="4" ariaLabel="4 个会话" title="4 个会话：2 运行，1 等待，1 出错" />;
const DEMO: State = {
  slots: { center: <span style={{ color: "var(--text-2)", fontSize: 13 }}>· · ·</span>, gauges: usageRing, agentCount: sessionRing },
  task: null, agents: true, count: 4,
};
let change: (next: Partial<State>) => void;
let openedPage: string | null = null;

function Fixture() {
  const [state, setState] = useState<State>(automated ? { task: "剩余3个待办", agents: false, count: 0 } : DEMO);
  change = (next) => setState((current) => ({ ...current, ...next }));
  const qq = useQQNotifications(true);
  const wechat = useWeChatReminders(true);
  const qqMail = useMail(true);
  return <div className="stage" style={{ "--collapsed-island-width": "300px" } as CSSProperties}>
    <IslandShell deviceUse={{ camera: [], microphone: [] }} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={{ notification: null, dismiss: () => {}, runAction: () => {} }}
      mode="collapsed" page="todo" isTucked={false} isDetached={true} showTitle={false}
      showCollapsedText={true} collapsedTaskTitle={state.task} collapsedTodoCount={null} agentSession={state.agentTitle ? { provider: "codex", label: "Codex", title: state.agentTitle } : null} activeAgentSessionCount={state.count}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: false, clipboard: true, shelf: true, qq: false, wechat: false, qqMail: false, agents: state.agents, translation: false }}
      shelfCount={null} collapsedSlots={state.slots}
      onOpenPage={(page) => { openedPage = page; }} onOpenMessages={() => {}}
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
const bar = () => document.querySelector<HTMLElement>(".island__collapsed")!;
const set = (next: Partial<State>) => act(async () => change(next));
async function settle() {
  const deadline = performance.now() + 1500;
  while (bar().querySelector(".island__summary-layer--outgoing, .island__summary-layer--incoming")) {
    if (performance.now() > deadline) throw new Error("等待摘要动画结束超时");
    await act(async () => { await new Promise(requestAnimationFrame); });
  }
}
const results = document.getElementById("results")!;
const rings = document.getElementById("rings")!;

async function runChecks() {
  try {
    const plain = bar().innerHTML;
    for (const slots of [{}, { center: null, gauges: false, agentCount: undefined }] as CollapsedSlots[]) {
      await set({ slots });
      check(bar().innerHTML === plain, `空槽位不改变收起条（${JSON.stringify(slots)}）`);
    }
    await set({ slots: undefined, task: null });
    await settle();
    const empty = bar().innerHTML;
    for (const slots of [{}, { center: null, gauges: false, agentCount: undefined }] as CollapsedSlots[]) {
      await set({ slots });
      check(bar().innerHTML === empty && !bar().querySelector(".island__center-slot, .island__gauge-slot, .island__open-button--center"),
        `摘要为空时空槽位不渲染外层元素（${JSON.stringify(slots)}）`);
    }
    await set({ slots: undefined, task: "剩余3个待办" });
    await settle();
    await set({ slots: undefined, agents: true, count: 2 });
    const withCount = bar().innerHTML;
    await set({ slots: {} });
    check(bar().innerHTML === withCount, "AI Agent 开启时空槽位仍显示原会话数");

    await set({ agents: false, count: 0, slots: { center: <span className="test-center">中</span> } });
    check(!bar().querySelector(".island__center-slot"), "有待办摘要时不显示中心槽位");
    // With rings and the session count on the right, the pattern centres in the space left between them.
    await set({ task: null, agents: true, count: 2, slots: { center: <span className="test-center">中</span>, gauges: <span className="test-gauge" style={{ display: "block", width: 42, height: 20 }} /> } });
    const box = (selector: string) => bar().querySelector(selector)!.getBoundingClientRect();
    const [pattern, slot, light, gauges] = [box(".test-center"), box(".island__center-slot"), box(".island__pulse"), box(".island__gauge-slot")];
    check(Math.abs(pattern.left + pattern.width / 2 - (slot.left + slot.width / 2)) < 1
      && Math.abs(pattern.top + pattern.height / 2 - (bar().getBoundingClientRect().top + 19)) < 1, "摘要为空时中心图案在剩余空间居中");
    check(slot.left >= light.right && slot.right <= gauges.left, "中心槽位在状态灯与右侧元素之间，不压住仪表");
    openedPage = null;
    await act(async () => bar().querySelector<HTMLElement>(".test-center")!.click());
    check(openedPage === "todo", "点中心图案和点小岛一样打开页面");
    await set({ agents: false, count: 0 });

    await set({ slots: { gauges: <span className="test-gauge" /> } });
    const gauge = () => bar().querySelector(".island__gauge-slot")!;
    check(gauge().nextElementSibling?.classList.contains("island__quiet-button") && bar().lastElementChild === gauge().nextElementSibling,
      "仪表槽位在收起灰点之前");
    await set({ agents: true, count: 2 });
    check(gauge().nextElementSibling?.classList.contains("island-agent-count") && bar().lastElementChild === gauge().nextElementSibling,
      "仪表槽位在会话数之前");

    await set({ slots: { agentCount: <span className="test-sessions" /> } });
    check(bar().querySelector(".test-sessions") && !bar().querySelector(".island-agent-count"), "AI Agent 开启时会话槽位替换蓝色数字");
    await set({ agents: false });
    check(!bar().querySelector(".test-sessions") && bar().querySelector(".island__quiet-button"), "AI Agent 关闭时会话槽位不显示，保留收起灰点");

    await set({ agentTitle: "修复登录", slots: { center: <span className="test-center" />, agentIcon: <span className="test-agent-icon" /> } });
    const session = bar().querySelector(".island__agent-session")!;
    check(session.querySelector(".test-agent-icon") && !session.querySelector(".agent-provider-icon") && !bar().querySelector(".test-center"),
      "有 Agent 标题时图标槽位替换标题前的 Agent 图标，中心槽隐藏");
    await set({ slots: {} });
    check(bar().querySelector(".island__agent-session .agent-provider-icon"), "图标槽位为空时照旧显示 Agent 图标");
    await set({ agentTitle: undefined });

    await act(async () => createRoot(rings).render(<>
      <MiniRing rings={[{ value: 0.5, color: "red" }, { value: 0, color: "blue" }]} ariaLabel="两圈" title="两圈提示" />
      <MiniRing segments={[{ value: 0.3, color: "red" }, { value: 0.2, color: "green" }, { value: 0, color: "blue" }]} label="7" size={24} ariaLabel="分段" />
      <MiniRing rings={[{ value: 1, color: "red" }]} ariaLabel="满圈" />
    </>));
    const [concentric, segmented, full] = [...rings.querySelectorAll<HTMLElement>(".mini-ring")];
    check(concentric.getAttribute("role") === "img" && concentric.getAttribute("aria-label") === "两圈" && concentric.title === "两圈提示", "MiniRing 用调用方的 aria-label 和提示");
    check(concentric.querySelectorAll(".mini-ring__track").length === 2 && concentric.querySelectorAll(".mini-ring__arc").length === 1, "同心双环：两条底轨，值为 0 的环不画弧");
    check(concentric.querySelector("svg")!.getAttribute("width") === "20", "默认尺寸 20px");
    check(segmented.querySelectorAll(".mini-ring__track").length === 1 && segmented.querySelectorAll(".mini-ring__arc").length === 2, "分段环：一条底轨，两段非零弧");
    check(segmented.querySelector(".mini-ring__label")?.textContent === "7" && segmented.getBoundingClientRect().width === 24, "分段环中心标签与自定义尺寸");
    const fullArc = full.querySelector(".mini-ring__arc")!;
    check(fullArc.getAttribute("stroke-dasharray")?.endsWith(" 0") && getComputedStyle(fullArc).strokeLinecap === "round", "满值画整圈，圆头");

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
  createRoot(rings).render(<>{usageRing}{sessionRing}<MiniRing rings={[{ value: 0.9, color: "#ff8a80" }, { value: 0.4, color: "#b9a6ff" }]} size={28} strokeWidth={3} ariaLabel="28px" /></>);
  results.textContent = "演示：中心槽位、同心双环（仪表槽位）、分段会话环（替换会话数）。加 ?test=1 运行检查。";
}
