// pnpm dev, then open /tests/regression/agent-alerts.html. Drives useAgentAlerts with a stand-in
// for the island's mode and page, the in-front check mocked: when a session finishing, failing or
// waiting opens the Agent page, when it closes again, and when it stays quiet.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import { useAgentAlerts, type AlertedSession } from "../../src/features/agent-status/useAgentAlerts";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const DURATION_MS = 300;
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

function Harness() {
  const [sessions, changeSessions] = useState<AgentSessionSummary[]>([session("a", "running"), session("b", "running")]);
  const [state, changeIsland] = useState<Island>(island);
  const [canAlert, changeCanAlert] = useState(true);
  setSessions = changeSessions;
  setIsland = changeIsland;
  setCanAlert = changeCanAlert;
  island = state;
  alerted = useAgentAlerts({
    sessions,
    kinds: { completed: true, failed: true, waiting: true },
    durationMs: DURATION_MS,
    canAlert,
    isOpenOnAgents: state.mode === "expanded" && state.page === "agents",
    isCollapsed: state.mode === "collapsed",
    onOpen: () => changeIsland({ mode: "expanded", page: "agents" }),
    onClose: () => changeIsland((current) => ({ ...current, mode: "collapsed" })),
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

  // The panel: an alert shows its session alone and leaves the usage line out.
  const panel = createRoot(document.getElementById("panel")!);
  const listed = [session("a", "completed"), session("b", "running"), session("c", "completed")];
  const rows = () => [...document.querySelectorAll("#panel .agent-sessions__list > li")].map((row) => (row as HTMLElement).dataset.sessionKey);
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" showUsage />));
  check(rows().length === 3, "平时 Agent 页列出全部会话");
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" showUsage reveal={{ key: "claudeCode:c", kind: "completed", session: listed[2] }} />));
  check(rows().join() === "claudeCode:c" && !document.querySelector("#panel .agent-usage"), "弹出提醒时只显示触发的那一个会话，不显示用量");
  const gone = session("d", "completed");
  await act(async () => panel.render(<AgentSessionsPanel sessions={listed} hostDisplay="off" reveal={{ key: "claudeCode:d", kind: "completed", session: gone }} />));
  check(rows().join() === "claudeCode:d", "列表里没有这个会话（只列运行中的）时，按提醒时的样子显示它");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
