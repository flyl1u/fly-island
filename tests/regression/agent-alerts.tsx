// pnpm dev, then open /tests/regression/agent-alerts.html. Drives useAgentAlerts with a stand-in
// for the island's mode and page, the in-front check mocked: when a session finishing, failing or
// waiting opens the Agent page, when it closes again, and when it stays quiet.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import type { AgentAlertStarted } from "../../src/features/appearance/types";
import { useAgentAlerts, type AlertedSession } from "../../src/features/agent-status/useAgentAlerts";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const DURATION_MS = 300;
const SUMMARY = "修好了，已合入 main。完成提醒现在显示最后的回复，Markdown 符号已经去掉，卡片最多三行，高度按内容。";
let inFront: string[] = [];
mockIPC((command) => (command === "agent_sessions_in_front" ? inFront : null));
// The island holds the focus while the cursor rests on it; headless pages report focus on their own.
let hovering = false;
Object.defineProperty(document, "hasFocus", { value: () => hovering });

const session = (sessionId: string, phase: AgentSessionSummary["phase"]): AgentSessionSummary => ({
  provider: "claudeCode", sessionId, cwd: null, title: sessionId, model: null, effort: null,
  phase, lastMessage: null, updatedAt: 0, host: null, turnStartedAt: null,
});

type Island = { mode: "collapsed" | "expanded"; page: string };
let island: Island = { mode: "collapsed", page: "todo" };
let alerted: AlertedSession | null = null;
let setSessions: (sessions: AgentSessionSummary[]) => void;
let setIsland: (island: Island) => void;
let setCanAlert: (value: boolean) => void;
let setStarted: (value: AgentAlertStarted) => void;
let setRemindAfter: (ms: number) => void;
let reminded: string[] = [];
let opens = 0;
let closes = 0;

function Harness() {
  const [sessions, changeSessions] = useState<AgentSessionSummary[]>([session("a", "running"), session("b", "running")]);
  const [state, changeIsland] = useState<Island>(island);
  const [canAlert, changeCanAlert] = useState(true);
  // Off for the checks below, whose sessions run again between them; checked on its own at the end.
  const [started, changeStarted] = useState<AgentAlertStarted>("off");
  // Off until the reminder checks, so the waits above stay single alerts.
  const [remindAfterMs, changeRemindAfter] = useState(0);
  setRemindAfter = changeRemindAfter;
  setStarted = changeStarted;
  setSessions = changeSessions;
  setIsland = changeIsland;
  setCanAlert = changeCanAlert;
  island = state;
  alerted = useAgentAlerts({
    sessions,
    kinds: { started, completed: true, failed: true, waiting: true },
    durationMs: DURATION_MS,
    canAlert,
    isOpenOnAgents: state.mode === "expanded" && state.page === "agents",
    isCollapsed: state.mode === "collapsed",
    onOpen: () => { opens += 1; changeIsland({ mode: "expanded", page: "agents" }); },
    onClose: () => { closes += 1; changeIsland((current) => ({ ...current, mode: "collapsed" })); },
    remindAfterMs,
    onRemind: (sessions) => { reminded = [...reminded, ...sessions.map((one) => one.sessionId)]; },
  });
  return null;
}

// Set while rendering; read through a function so TypeScript does not narrow it to its initial null.
const latestAlert = (): AlertedSession | null => alerted;
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const results = document.getElementById("results")!;

try {
  await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><Harness /></StrictMode>); });
  await wait(50);
  check(island.mode === "collapsed", "打开时已有的会话不弹");

  await act(async () => setSessions([session("a", "completed"), session("b", "running")]));
  await wait(50);
  const opened = latestAlert();
  check(island.mode === "expanded" && island.page === "agents" && opened?.key === "claudeCode:a" && opened.kind === "completed", "会话完成时打开 Agent 页，并指向这个会话");
  await wait(DURATION_MS + 100);
  check(island.mode === "collapsed", "停留时间到了自动收起");

  inFront = ["b"];
  await act(async () => setSessions([session("a", "completed"), session("b", "waiting")]));
  await wait(50);
  check(island.mode === "collapsed", "会话窗口已在前台时不弹");
  inFront = [];

  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await act(async () => setCanAlert(false));
  await act(async () => setSessions([session("a", "failed"), session("b", "running")]));
  await wait(50);
  check(island.mode === "collapsed", "游戏模式勿扰时不弹");
  await act(async () => setCanAlert(true));

  await act(async () => setIsland({ mode: "expanded", page: "todo" }));
  await act(async () => setSessions([session("a", "failed"), session("b", "waiting")]));
  await wait(DURATION_MS + 100);
  check(island.mode === "expanded" && island.page === "todo", "你正在用展开的岛屿时不弹，也不替你收起");
  await act(async () => setIsland({ mode: "collapsed", page: "todo" }));

  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await act(async () => setSessions([session("a", "completed"), session("b", "running")]));
  await wait(50);
  hovering = true;
  await wait(DURATION_MS + 100);
  check(island.mode === "expanded", "鼠标停在岛上时不收起");
  hovering = false;
  await wait(1100);
  check(island.mode === "collapsed", "鼠标离开后再收起");

  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await act(async () => setSessions([session("a", "completed"), session("b", "running")]));
  await wait(50);
  const press = (target: EventTarget) => act(async () => { target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
  await press(document.getElementById("row")!);
  await wait(DURATION_MS + 100);
  check(island.mode === "expanded", "在弹出的面板里点过以后不再自动收起");
  check(latestAlert()?.key === "claudeCode:a", "点的是这个会话那一行时，仍只显示这一个会话");
  await press(window);
  check(island.mode === "expanded" && latestAlert() === null, "点了岛上别处（如 Agent 按钮）就换回完整列表，岛屿不收起");
  await act(async () => setIsland({ mode: "collapsed", page: "agents" }));

  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await act(async () => setSessions([session("a", "running"), session("b", "failed")]));
  await wait(50);
  check(latestAlert()?.key === "claudeCode:b", "下一条提醒只显示它自己的会话");
  await act(async () => setIsland({ mode: "expanded", page: "todo" }));
  check(latestAlert() === null, "切到别的页后不再是单会话视图");
  await act(async () => setIsland({ mode: "collapsed", page: "todo" }));
  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await act(async () => setSessions([session("a", "completed"), session("b", "running")]));
  await wait(DURATION_MS + 100);
  check(island.mode === "collapsed" && latestAlert() === null, "提醒自动收起后，下次打开 Agent 页是完整列表");

  await act(async () => setStarted("everyTurn"));
  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await wait(50);
  check(island.mode === "expanded" && latestAlert()?.key === "claudeCode:a" && latestAlert()?.kind === "started", "会话开始新一轮时弹出，只显示这个会话");
  await wait(DURATION_MS + 100);
  await act(async () => setSessions([session("a", "completed"), session("b", "running")]));
  await wait(DURATION_MS + 100);
  await act(async () => setStarted("newSession"));
  await act(async () => setSessions([session("a", "running"), session("b", "running")]));
  await wait(50);
  check(island.mode === "collapsed", "设为只在新会话时，已有会话的新一轮不弹");
  await act(async () => setSessions([session("a", "running"), session("b", "running"), session("n", "running")]));
  await wait(50);
  check(island.mode === "expanded" && latestAlert()?.key === "claudeCode:n" && latestAlert()?.kind === "started", "新会话开始时弹出");
  await wait(DURATION_MS + 100);

  // Reminders: a session still waiting a while later pops up once more, once per wait.
  const REMIND_MS = 800;
  // Reminders fire from a timer, mid-wait: short act() steps let React render in between, as the
  // app does at once (one long act() would hold the render until it ends).
  const settle = async (ms: number) => { for (let waited = 0; waited < ms; waited += 25) await wait(25); };
  const waitFor = (sessions: AgentSessionSummary[]) => act(async () => setSessions(sessions));
  const done = [session("a", "completed"), session("b", "completed")];
  await act(async () => setStarted("off"));
  await waitFor(done);
  await wait(50);
  await act(async () => setRemindAfter(REMIND_MS));
  await waitFor([...done, session("w", "running")]);
  await wait(50);
  let opensBefore = opens;
  await waitFor([...done, session("w", "waiting")]);
  await wait(50);
  check(island.mode === "expanded" && latestAlert()?.key === "claudeCode:w" && opens === opensBefore + 1 && reminded.length === 0, "开始等你确认时先弹一次，这时还不算补提醒");
  await settle(DURATION_MS + 100);
  check(island.mode === "collapsed", "停留时间到了收起");
  opensBefore = opens;
  await settle(REMIND_MS + 400);
  check(reminded.join() === "w" && opens === opensBefore + 1, `过了设定时间还在等，再弹一次并通知补提醒（放提示音）（${reminded.join()}，弹出 ${opens - opensBefore} 次）`);
  await settle(REMIND_MS + DURATION_MS + 400);
  check(island.mode === "collapsed" && reminded.length === 1 && opens === opensBefore + 1, `同一次等待只补提醒一次（${island.mode}，${reminded.join()}，弹出 ${opens - opensBefore}，收起 ${closes}，${latestAlert()?.kind}）`);
  await waitFor([...done, session("w", "running")]);
  await wait(50);
  await waitFor([...done, session("w", "waiting")]);
  await settle(REMIND_MS + DURATION_MS + 600);
  check(reminded.join() === "w,w", `回答后再次等待，又会补提醒一次（${reminded.join()}）`);
  inFront = ["w"];
  await waitFor([...done, session("w", "running")]);
  await wait(50);
  await waitFor([...done, session("w", "waiting")]);
  await settle(REMIND_MS + DURATION_MS + 600);
  check(reminded.length === 2 && island.mode === "collapsed", `会话窗口在前台时不补提醒（${reminded.join()}，${island.mode}）`);
  inFront = [];
  await act(async () => setRemindAfter(0));
  await settle(DURATION_MS + 100);

  // The panel: an alert shows its session alone and leaves the usage line out.
  const panel = createRoot(document.getElementById("panel")!);
  const listed = [session("a", "completed"), session("b", "running"), { ...session("c", "completed"), lastMessage: SUMMARY }];
  let measured = 0;
  const card = (id: string, alerted: AgentSessionSummary): AlertedSession => ({
    key: `claudeCode:${id}`, kind: "completed", session: alerted, rowHeight: 78, measure: (height) => { measured = height; },
  });
  const rows = () => [...document.querySelectorAll("#panel .agent-sessions__list > li")].map((row) => (row as HTMLElement).dataset.sessionKey);
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" showUsage />));
  check(rows().length === 3, "平时 Agent 页列出全部会话");
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" showUsage reveal={card("c", listed[2])} />));
  check(rows().join() === "claudeCode:c" && !document.querySelector("#panel .agent-quota"), "弹出提醒时只显示触发的那一个会话，不显示用量");
  const reply = document.querySelector<HTMLElement>("#panel .agent-session__message--card");
  check(reply?.textContent === SUMMARY && getComputedStyle(reply).getPropertyValue("-webkit-line-clamp") === "3", "完成的会话在卡片上显示最后的回复，最多 3 行");
  const row = document.querySelector<HTMLElement>("#panel .agent-sessions__list > li")!;
  check(measured > 36 && measured === row.offsetHeight, `卡片把这一行的实际高度交给岛屿（${measured}px）`);
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" />));
  check(!document.querySelector("#panel .agent-session--completed .agent-session__message"), "平时 Agent 页里结束的会话仍折叠成一行");
  const gone = session("d", "completed");
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" reveal={card("d", gone)} />));
  check(rows().join() === "claudeCode:d", "列表里没有这个会话（只列运行中的）时，按提醒时的样子显示它");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
