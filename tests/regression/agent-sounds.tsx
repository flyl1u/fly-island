import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { useAgentSounds } from "../../src/features/agent-status/sounds/useAgentSounds";
import { AGENT_SOUNDS_STORAGE_KEY } from "../../src/features/agent-status/sounds/storage";
import { announceTiming } from "../../src/features/agent-status/announce";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import "../../src/styles/tokens.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(announceTiming, { completeMs: 0, waitMs: 0 });
let plays = 0;
Object.assign(globalThis, { Audio: class { volume = 1; play() { plays += 1; return Promise.resolve(); } } });
let resolveFront: ((ids: string[]) => void) | undefined;
mockIPC((command) => command === "agent_sessions_in_front"
  ? new Promise<string[]>((resolve) => { resolveFront = resolve; }) : null);
const session = (id: string, completed = Date.now()): AgentSessionSummary => ({
  provider: "codex", sessionId: id, phase: "completed", title: id, cwd: null, model: null, effort: null,
  lastMessage: null, updatedAt: completed, lastCompletedAt: completed, turnStartedAt: completed - 1000,
  ownerPromptAt: completed - 1000, host: null,
});
let changeSessions: (sessions: AgentSessionSummary[]) => void;
let changeCanPlay: (enabled: boolean) => void;
function Harness() {
  const [sessions, setSessions] = useState([session("old", Date.now() - 60_000)]);
  const [canPlay, setCanPlay] = useState(true);
  changeSessions = setSessions; changeCanPlay = setCanPlay;
  useAgentSounds(sessions, canPlay);
  return null;
}
const results = document.getElementById("results")!;
const messages: string[] = [];
function check(condition: boolean, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const root = () => createRoot(document.getElementById("fixture")!);
try {
  localStorage.removeItem(AGENT_SOUNDS_STORAGE_KEY);
  let app = root();
  await act(async () => app.render(<StrictMode><Harness /></StrictMode>));
  await wait();
  check(plays === 0 && resolveFront === undefined, "历史完成会话在启动时保持安静");
  await act(async () => changeSessions([session("unmounted")])); await wait();
  check(typeof resolveFront === "function", "完成后的前台窗口检查可异步返回");
  await act(async () => app.unmount());
  await act(async () => resolveFront?.([])); await wait();
  check(plays === 0, "组件卸载后返回的前台检查不播放");

  app = root();
  await act(async () => app.render(<StrictMode><Harness /></StrictMode>)); await wait();
  await act(async () => changeSessions([session("quiet")])); await wait();
  await act(async () => changeCanPlay(false));
  await act(async () => resolveFront?.([])); await wait();
  check(plays === 0, "游戏模式生效后旧的异步提醒保持安静");
  await act(async () => changeCanPlay(true));
  await act(async () => changeSessions([session("disabled")])); await wait();
  await act(async () => {
    localStorage.setItem(AGENT_SOUNDS_STORAGE_KEY, JSON.stringify({ enabled: false }));
    window.dispatchEvent(new StorageEvent("storage", { key: AGENT_SOUNDS_STORAGE_KEY }));
  });
  await act(async () => resolveFront?.([])); await wait();
  check(plays === 0, "提示音关闭后旧的异步提醒保持安静");
  await act(async () => {
    localStorage.removeItem(AGENT_SOUNDS_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: AGENT_SOUNDS_STORAGE_KEY }));
  });
  const done = session("once");
  await act(async () => changeSessions([done])); await wait();
  await act(async () => resolveFront?.([])); await wait();
  check(plays === 1, "启用时最近完成的用户任务只播放一次");
  await act(async () => changeSessions([]));
  await act(async () => changeSessions([done])); await wait();
  check(plays === 1, "会话短暂消失再出现不重复播放");
  await act(async () => app.unmount());
  results.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  results.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
