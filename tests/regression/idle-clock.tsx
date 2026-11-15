import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import type { IslandSettings } from "../../src/features/appearance/types";
import { IdleClock } from "../../src/features/appearance/IdleClock";
import { IdleClockSettingsSection } from "../../src/features/appearance/IdleClockSettingsSection";
import { useCollapsedTodo } from "../../src/windows/island/useCollapsedTodo";
import { useCollapsedNotice } from "../../src/windows/island/useCollapsedNotice";
import { useIslandNavigation } from "../../src/windows/island/useIslandNavigation";
import { useIslandAgentAlerts } from "../../src/windows/island/useIslandAgentAlerts";
import type { TodoTimer } from "../../src/features/todos/timer";
import { AGENT_APPROVAL_REQUESTED_EVENT, AGENT_APPROVAL_CLOSED_EVENT } from "../../src/features/agent-status/approvals/api";
import { AGENT_APPROVAL_STORAGE_KEY } from "../../src/features/agent-status/approvals/storage";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import { I18nProvider, useLocale } from "../../src/i18n";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
let visible = true;
let deferred = false;
let waitingVisibility: ((value: boolean) => void)[] = [];
let inFront: string[] = [];
mockIPC((command) => {
  if (command === "plugin:window|is_visible") return deferred ? new Promise<boolean>((resolve) => waitingVisibility.push(resolve)) : visible;
  if (command === "agent_sessions_in_front") return inFront;
  if (command === "agent_approval_pending") return [];
  return null;
}, { shouldMockEvents: true });
mockWindows("main");
const oldApprovals = localStorage.getItem(AGENT_APPROVAL_STORAGE_KEY);
localStorage.setItem(AGENT_APPROVAL_STORAGE_KEY, JSON.stringify({ onIsland: true }));
window.addEventListener("beforeunload", () => {
  if (oldApprovals === null) localStorage.removeItem(AGENT_APPROVAL_STORAGE_KEY);
  else localStorage.setItem(AGENT_APPROVAL_STORAGE_KEY, oldApprovals);
});

const pending = [{ id: "todo", title: "尚未开始", completed: false, createdAt: 0 }];
const currentYear = String(new Date().getFullYear());
const session = (phase: AgentSessionSummary["phase"]): AgentSessionSummary => ({
  provider: "codex", sessionId: "clock-test", title: "Agent 测试", cwd: null, model: null, effort: null,
  phase, lastMessage: null, updatedAt: Date.now(), host: null, turnStartedAt: null,
});
let nav: ReturnType<typeof useIslandNavigation>;
let reminders: ReturnType<typeof useCollapsedNotice>;
let choice: ReturnType<typeof useCollapsedTodo>;
let patch: (value: Partial<IslandSettings>) => void;
let setQuiet: (value: boolean) => void;
let setActive: (value: boolean) => void;
let setAgent: (value: string | null) => void;
let setLyrics: (value: boolean) => void;
let setBalance: (value: string | null) => void;
let setTimer: (value: TodoTimer | null) => void;
let setSessions: (value: AgentSessionSummary[]) => void;
let changeLocale: (value: "en" | "zh-CN") => void;
let parentRenders = 0;

function Harness() {
  parentRenders++;
  const [settings, update] = useState<IslandSettings>({ ...DEFAULT_SETTINGS, autoTuck: false, idleClockSeconds: true, agentAlertStarted: "everyTurn" });
  const [quiet, updateQuiet] = useState(false);
  const [active, updateActive] = useState(false);
  const [agent, updateAgent] = useState<string | null>(null);
  const [lyrics, updateLyrics] = useState(false);
  const [balance, updateBalance] = useState<string | null>(null);
  const [timer, updateTimer] = useState<TodoTimer | null>(null);
  const [sessions, updateSessions] = useState<AgentSessionSummary[]>([]);
  patch = (value) => update((current) => ({ ...current, ...value }));
  setQuiet = updateQuiet;
  setActive = updateActive;
  setAgent = updateAgent;
  setLyrics = updateLyrics;
  setBalance = updateBalance;
  setTimer = updateTimer;
  setSessions = updateSessions;
  changeLocale = useLocale().setLocale;
  nav = useIslandNavigation();
  reminders = useCollapsedNotice(settings, nav, quiet);
  choice = useCollapsedTodo(pending, active ? "todo" : null, settings, true, agent, { lyricsPlaying: lyrics, balanceText: balance, timer });
  useIslandAgentAlerts({ sessions, unseen: new Set(), settings, enabled: !quiet && settings.agentStatusEnabled,
    mode: nav.mode, page: nav.page, openIslandPage: nav.openIslandPage, collapseIsland: nav.collapseIsland, onNotice: reminders.showNotice });
  return <>
    <div id="clock" style={{ width: 180 }}>{choice.showIdleClock && <IdleClock settings={settings} active={nav.mode === "collapsed" && !nav.isTucked && !reminders.notice} />}</div>
    <div id="notice">{reminders.notice?.text}</div>
    <IdleClockSettingsSection settings={settings} onSettingsChange={update} />
  </>;
}
createRoot(document.getElementById("fixture")!).render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>);
const wait = (ms = 30) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const update = async (callback: () => void) => { await act(async () => callback()); await wait(); };
const messages: string[] = [];
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
  messages.push(`PASS ${message}`);
  document.getElementById("results")!.textContent = messages.join("\n");
};
const clock = () => document.querySelector<HTMLTimeElement>("#clock time")!;

async function run() {
  try {
    await wait(80);
    check(choice.showIdleClock && clock(), "空闲时默认显示时钟，尚未开始的待办不挡时钟");
    const renders = parentRenders;
    const before = clock().dateTime;
    await wait(1200);
    check(clock().dateTime !== before && parentRenders === renders, "秒级更新只刷新时钟叶子组件");
    await update(() => patch({ idleClockDateFormat: "long", idleClockWeekday: "long", idleClockHour12: true }));
    await update(() => changeLocale("en"));
    check(clock().textContent?.includes(currentYear) && !/[\u4e00-\u9fff]/.test(clock().textContent ?? ""), "英文完整日期与 12 小时制可显示");
    check(clock().getBoundingClientRect().width <= 180, "窄窗口中长格式不溢出");
    await update(() => changeLocale("zh-CN"));
    await update(() => patch({ idleClockDateFormat: "custom", idleClockCustomFormat: "YYYY年MM月DD日", idleClockOrder: "dateFirst" }));
    check(clock().textContent?.startsWith(`${currentYear}年`), "自定义格式、顺序及中英文实时生效");
    await update(() => setActive(true));
    check(!choice.showIdleClock && choice.collapsedItem === "todo", "进行中待办优先");
    await update(() => { setActive(false); setAgent("运行中的 Agent"); });
    check(!choice.showIdleClock && choice.collapsedItem === "agent", "Agent 状态优先");
    await update(() => { setAgent(null); setLyrics(true); });
    check(!choice.showIdleClock && choice.collapsedItem === "lyrics", "播放歌词优先");
    await update(() => { setBalance("余额 · 12.5 USD"); patch({ collapsedPriority: ["clock", "balance", "todo", "agent", "lyrics"] }); });
    check(choice.showIdleClock && choice.collapsedItem === "clock", "时间排在最前时优先于歌词和余额");
    await update(() => { setAgent("Agent"); setActive(true); });
    check(choice.showIdleClock, "时间排序也优先于 Agent 和已开始待办");
    await update(() => patch({ idleClockEnabled: false }));
    check(!choice.showIdleClock && choice.collapsedItem === "balance", "时钟总开关关闭时跳过时间优先级");
    await update(() => patch({ balanceShowCollapsed: false }));
    check(choice.collapsedItem === "todo", "关闭折叠余额后跳过余额继续按排序显示");
    await update(() => patch({ idleClockEnabled: true, balanceShowCollapsed: true }));
    await update(() => setTimer({ todoId: "todo", durationMinutes: 5, endsAt: Date.now() + 300000, notified: false }));
    check(!choice.showIdleClock && choice.collapsedItem === "todo", "进行中的倒计时保持优先，不被时间排序遮挡");
    await update(() => { setTimer(null); setActive(false); setAgent(null); setLyrics(false); patch({ collapsedPriority: [...DEFAULT_SETTINGS.collapsedPriority] }); });
    check(choice.collapsedItem === "balance", "默认排序保持余额优先于时间");
    await update(() => patch({ balanceShowCollapsed: false }));
    check(choice.showIdleClock, "关闭余额显示后恢复时间");
    await update(() => { setBalance(null); patch({ balanceShowCollapsed: true }); });
    await update(() => { setLyrics(false); patch({ idleClockEnabled: false }); });
    check(!choice.showIdleClock && choice.collapsedItem === "todo", "关闭时钟恢复未开始待办数量");
    await update(() => patch({ idleClockEnabled: true, showCollapsedText: false }));
    check(choice.showIdleClock, "时钟开关独立于原有折叠文字开关");

    await update(() => nav.minimizeToEdge());
    await update(() => reminders.showNotice("新的提醒", "agents", 140));
    check(nav.mode === "collapsed" && !nav.isTucked && !nav.isPeeking && reminders.notice?.text === "新的提醒", "贴边收到提醒回到完整折叠态，清除旧 peek");
    const pausedAt = clock().dateTime;
    await wait(170);
    check(!reminders.notice && !nav.isTucked, "提醒到期后保持折叠，交回闲置计时");
    await update(() => nav.openIslandPage("todo"));
    const expandedAt = clock().dateTime;
    await wait(1100);
    check(clock().dateTime === expandedAt && pausedAt, "展开时停止隐藏时钟刷新");
    await update(() => reminders.showNotice("不抢占操作", "agents"));
    check(nav.mode === "expanded" && nav.page === "todo" && !reminders.notice, "提醒不抢占展开面板");
    await update(() => nav.collapseIsland());
    await update(() => setQuiet(true));
    await update(() => reminders.showNotice("勿扰", "agents"));
    check(!reminders.notice, "游戏勿扰时无提醒");
    await update(() => setQuiet(false));
    visible = false;
    await update(() => reminders.showNotice("隐藏", "todo"));
    check(!reminders.notice, "托盘隐藏时不显示提醒");
    visible = true;
    await update(() => { patch({ revealOnMessage: false }); nav.tuckIsland(); });
    await update(() => reminders.showNotice("关闭唤出", "agents"));
    check(nav.isTucked && !reminders.notice, "尊重贴边消息唤出开关");
    await update(() => { patch({ revealOnMessage: true }); nav.collapseIsland(); });
    deferred = true;
    await update(() => { reminders.showNotice("旧消息", "agents"); reminders.showNotice("新消息", "todo"); });
    const pendingChecks = waitingVisibility;
    waitingVisibility = [];
    await update(() => pendingChecks[1](true));
    await update(() => pendingChecks[0](true));
    check(reminders.notice?.text === "新消息", "异步可见性结果乱序也只显示最新提醒");
    deferred = false;
    await update(() => nav.openIslandPage("todo"));
    await update(() => nav.minimizeToEdge());
    await update(() => setSessions([session("running")]));
    check(nav.mode === "collapsed" && !nav.isTucked && reminders.notice?.page === "agents", "真实 Agent 开始提醒通过折叠摘要唤出");
    await update(() => nav.openIslandPage("music"));
    await update(() => setSessions([session("failed")]));
    check(nav.page === "music" && !reminders.notice, "Agent 失败不会覆盖正在操作的页面");
    await update(() => nav.minimizeToEdge());
    inFront = ["clock-test"];
    await update(() => setSessions([session("running")]));
    check(nav.isTucked && !reminders.notice, "Agent 前台窗口过滤仍然有效");
    inFront = [];
    await act(async () => emit(AGENT_APPROVAL_REQUESTED_EVENT, { id: 7, kind: "permission", agent: "codex", sessionId: "permission", cwd: null, toolName: "Bash", toolInput: {}, permissionSuggestions: null, receivedAt: Date.now() }));
    await wait(60);
    check(nav.mode === "collapsed" && !nav.isTucked && reminders.notice?.page === "agents", "Agent 审批也先显示折叠提醒");
    await update(() => nav.openIslandPage("agents"));
    await act(async () => emit(AGENT_APPROVAL_CLOSED_EVENT, { id: 7, reason: "answeredElsewhere" }));
    await wait();
    check(nav.mode === "expanded", "审批结束不关闭用户手动打开的面板");
    document.getElementById("results")!.textContent = messages.join("\n");
    document.documentElement.dataset.testResult = "passed";
  } catch (error) {
    document.getElementById("results")!.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    document.documentElement.dataset.testResult = "failed";
  }
}
void run();
