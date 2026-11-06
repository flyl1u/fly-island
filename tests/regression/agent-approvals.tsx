// pnpm dev, then open /tests/regression/agent-approvals.html. Drives the permission request card
// (roadmap B6 phase 2) with the agent hook endpoint mocked: its events, the pending list and the
// decisions sent back. Checks when the Agent page opens and closes for a request, what the card
// shows, and which requests go straight back to the terminal.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import type { AgentApprovalRequest } from "../../src/features/agent-status/approvals/api";
import { APPROVAL_ARM_MS } from "../../src/features/agent-status/approvals/AgentApprovalCard";
import { useAgentApprovals, type AgentApprovals } from "../../src/features/agent-status/approvals/useAgentApprovals";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });

const COMMAND = "pnpm test:regression agent && git status --short && cmd //c echo 一条很长的命令，用来看两行之后是否折叠，点开后能看到全部内容";
const request = (id: string, sessionId: string, extra: Partial<AgentApprovalRequest> = {}): AgentApprovalRequest => ({
  id, provider: "claudeCode", sessionId, cwd: "E:\\Projects\\fly-island", toolName: "Bash",
  toolInput: { command: COMMAND, description: "跑回归页并查看改动" }, receivedAt: 0, ...extra,
});
const SUGGESTIONS = [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "pnpm test:regression:*" }], behavior: "allow", destination: "localSettings" }];

let pending: AgentApprovalRequest[] = [request("p1", "s1", { permissionSuggestions: SUGGESTIONS })];
let inFront: string[] = [];
const decisions: string[] = [];
const focused: string[] = [];
mockIPC(
  (command, args) => {
    const payload = args as Record<string, unknown>;
    if (command === "agent_sessions_in_front") return inFront;
    if (command === "agent_approval_pending") return pending;
    if (command === "agent_approval_decide") decisions.push(`${String(payload.id)}:${String(payload.decision)}`);
    if (command === "focus_agent_window") focused.push(String(payload.sessionId));
    return command === "focus_agent_window" ? true : null;
  },
  { shouldMockEvents: true },
);

const sessions: AgentSessionSummary[] = [{
  provider: "claudeCode", sessionId: "s1", cwd: "E:\\Projects\\fly-island", title: "岛上审批", model: null, effort: null,
  phase: "waiting", lastMessage: null, updatedAt: 0, host: null, turnStartedAt: null,
}];

type Island = { mode: "collapsed" | "expanded"; page: string };
let island: Island = { mode: "collapsed", page: "todo" };
let approvals: AgentApprovals | null = null;
let setIsland: (island: Island) => void;
let setEnabled: (value: boolean) => void;

function Harness() {
  const [state, changeIsland] = useState<Island>(island);
  const [enabled, changeEnabled] = useState(true);
  setIsland = changeIsland;
  setEnabled = changeEnabled;
  island = state;
  const isOpenOnAgents = state.mode === "expanded" && state.page === "agents";
  approvals = useAgentApprovals({
    enabled,
    isOpenOnAgents,
    onOpen: () => changeIsland({ mode: "expanded", page: "agents" }),
    onClose: () => changeIsland((current) => ({ ...current, mode: "collapsed" })),
  });
  return isOpenOnAgents ? <AgentSessionsPanel sessions={sessions} hostDisplay="off" approvals={approvals} /> : null;
}

const last = (items: string[]) => items[items.length - 1];
const current = () => approvals?.current?.id ?? null;
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const send = (item: AgentApprovalRequest) => act(async () => { await emit("agent-approval-requested", item); });
const close = (id: string, reason: string) => act(async () => { await emit("agent-approval-closed", { id, reason }); });
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("#fixture .agent-approval__button")].find((item) => item.textContent === name);
const click = (target: HTMLElement | undefined) => act(async () => { target?.click(); });
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const results = document.getElementById("results")!;

try {
  await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><Harness /></StrictMode>); });
  await wait(50);
  check(island.mode === "expanded" && island.page === "agents" && current() === "p1", "打开岛屿时已在等待的请求会弹出 Agent 页");
  pending = [];
  const preview = document.querySelector<HTMLElement>("#fixture .agent-approval__preview")!;
  check(preview.textContent === COMMAND && getComputedStyle(preview).getPropertyValue("-webkit-line-clamp") === "2", "卡片显示完整命令，默认折成两行");
  check(document.querySelector("#fixture .agent-approval__title")?.textContent?.includes("岛上审批"), "卡片用会话列表里的标题");
  check(document.querySelector("#fixture .agent-approval__note")?.textContent === "跑回归页并查看改动", "显示 Agent 对命令的说明");
  check(button("始终允许")?.title.includes("Bash(pnpm test:regression:*)"), "有建议规则时显示「始终允许」，提示里写出规则");
  const collapsedHeight = approvals!.cardHeight;
  await click(preview);
  await wait(50);
  check(approvals!.cardHeight > collapsedHeight, `点开命令后卡片变高，岛屿跟着变（${collapsedHeight} → ${approvals!.cardHeight}px）`);

  check(button("允许")?.disabled, "卡片出现后 0.5 秒内按钮不可点");
  await wait(APPROVAL_ARM_MS);
  await click(button("允许"));
  await wait(50);
  check(decisions.join() === "p1:allow" && current() === null, "点「允许」把决定发回 Agent");
  check(island.mode === "collapsed", "最后一个请求处理完，由它打开的岛屿收起");

  await send(request("q1", "s1"));
  await send(request("q2", "s2", { provider: "codex", toolInput: { command: ["git", "push"] } }));
  await wait(50);
  check(current() === "q1" && document.querySelector("#fixture .agent-approval__meta")?.textContent?.includes("还有 1 个"), "多个请求排队，卡片上显示还有几个");
  check(!button("始终允许"), "没有建议规则时不显示「始终允许」");
  await wait(APPROVAL_ARM_MS);
  await click(button("拒绝"));
  await wait(50);
  check(last(decisions) === "q1:deny" && current() === "q2", "拒绝后显示下一个");
  check(document.querySelector("#fixture .agent-approval__preview")?.textContent === "git push", "Codex 的参数列表拼成一行命令");
  check(button("允许")?.disabled, "换成下一个请求时按钮重新等 0.5 秒");
  await close("q2", "disconnected");
  await wait(50);
  check(current() === null && island.mode === "collapsed", "Agent 那边断开（按了 Esc）时撤掉卡片");

  await send(request("t1", "s1"));
  await wait(APPROVAL_ARM_MS + 50);
  await click(button("到终端"));
  await wait(50);
  check(last(decisions) === "t1:terminal" && last(focused) === "s1", "「到终端」交回终端并切到它的窗口");

  inFront = ["s1"];
  await send(request("f1", "s1"));
  await wait(50);
  check(last(decisions) === "f1:terminal" && island.mode === "collapsed", "会话窗口已在前台时直接交回终端，不弹");
  inFront = [];

  await act(async () => setEnabled(false));
  await send(request("g1", "s1"));
  await wait(50);
  check(last(decisions) === "g1:terminal" && island.mode === "collapsed", "游戏模式勿扰时直接交回终端");
  await act(async () => setEnabled(true));

  await act(async () => setIsland({ mode: "expanded", page: "todo" }));
  const input = document.getElementById("typing") as HTMLInputElement;
  input.focus();
  await send(request("w1", "s1"));
  await wait(200);
  check(island.page === "todo" && current() === "w1", "正在岛上打字时先不切页，请求排着");
  input.blur();
  await wait(1100);
  check(island.page === "agents", "打完字后切到 Agent 页显示卡片");
  await act(async () => setIsland({ mode: "expanded", page: "todo" }));
  await wait(50);
  check(island.page === "todo" && current() === "w1", "你切走以后不再把你拉回来");
  await act(async () => setEnabled(false));
  await wait(50);
  check(last(decisions) === "w1:terminal" && current() === null, "转入勿扰时，还在等的请求交回终端");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
