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
// Requests are named in the checks ("p1"); the endpoint numbers them.
const names: string[] = [];
const idOf = (name: string) => (names.includes(name) ? names.indexOf(name) : names.push(name) - 1) + 1;
const nameOf = (id: unknown) => names[Number(id) - 1] ?? String(id);
const request = (name: string, sessionId: string, extra: Partial<AgentApprovalRequest> = {}): AgentApprovalRequest => ({
  id: idOf(name), kind: "permission", agent: "claudeCode", sessionId, permissionSuggestions: null, cwd: "E:\\Projects\\fly-island", toolName: "Bash",
  toolInput: { command: COMMAND, description: "跑回归页并查看改动" }, receivedAt: 0, ...extra,
});
const SUGGESTIONS = [{ type: "addRules", rules: [{ toolName: "Bash", ruleContent: "pnpm test:regression:*" }], behavior: "allow", destination: "localSettings" }];

let pending: AgentApprovalRequest[] = [request("p1", "s1", { permissionSuggestions: SUGGESTIONS })];
let inFront: string[] = [];
const decisions: string[] = [];
const focused: string[] = [];
let hotkeys: string[] = [];
let endpointEnabled = false;
let answered: Record<string, string> | null = null;
mockIPC(
  (command, args) => {
    const payload = args as Record<string, unknown>;
    if (command === "agent_sessions_in_front") return inFront;
    if (command === "agent_approval_pending") return pending;
    if (command === "agent_approval_decide") {
      decisions.push(`${nameOf(payload.id)}:${String(payload.decision)}`);
      answered = (payload.answers as Record<string, string> | null) ?? null;
    }
    if (command === "focus_agent_window") focused.push(String(payload.sessionId));
    if (command === "set_agent_approval_enabled") endpointEnabled = Boolean(payload.enabled);
    if (command === "set_agent_approval_hotkeys") hotkeys = (payload.hotkeys as { shortcut: string }[]).map((item) => item.shortcut);
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
let setWhenInFront: (value: boolean) => void;

function Harness() {
  const [state, changeIsland] = useState<Island>(island);
  const [enabled, changeEnabled] = useState(true);
  const [whenInFront, changeWhenInFront] = useState(false);
  setIsland = changeIsland;
  setEnabled = changeEnabled;
  setWhenInFront = changeWhenInFront;
  island = state;
  const isOpenOnAgents = state.mode === "expanded" && state.page === "agents";
  approvals = useAgentApprovals({
    enabled,
    whenInFront,
    isOpenOnAgents,
    onOpen: () => changeIsland({ mode: "expanded", page: "agents" }),
    onClose: () => changeIsland((current) => ({ ...current, mode: "collapsed" })),
  });
  return isOpenOnAgents ? <AgentSessionsPanel sessions={sessions} hostDisplay="off" approvals={approvals} /> : null;
}

const last = (items: string[]) => items[items.length - 1];
const current = () => (approvals?.current ? nameOf(approvals.current.id) : null);
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const send = (item: AgentApprovalRequest) => act(async () => { await emit("agent-approval-requested", item); });
const close = (name: string, reason: string) => act(async () => { await emit("agent-approval-closed", { id: idOf(name), reason }); });
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
  check(endpointEnabled, "岛上审批开着时通知端点挂起请求");
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
  await send(request("q2", "s2", { agent: "codex", toolInput: { command: ["git", "push"] } }));
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

  await send(request("e1", "s1"));
  await send(request("e2", "s2"));
  await wait(50);
  await close("e1", "answeredElsewhere");
  await wait(50);
  check(current() === "e2" && !decisions.some((decision) => decision.startsWith("e1:")), "终端里已经答了的请求撤掉卡片，不再发决定，下一个顶上");
  await close("e2", "answeredElsewhere");
  await wait(50);
  check(current() === null && island.mode === "collapsed", "全在终端答完后，由卡片打开的岛屿收起");

  await send(request("t1", "s1"));
  await wait(APPROVAL_ARM_MS + 50);
  await click(button("到终端"));
  await wait(50);
  check(last(decisions) === "t1:terminal" && last(focused) === "s1", "「到终端」交回终端并切到它的窗口");

  check(hotkeys.length === 0, "卡片消失后释放快捷键");
  await send(request("k1", "s1"));
  await wait(100);
  check(hotkeys.length === 0, "卡片出现后 0.5 秒内不注册快捷键");
  await wait(APPROVAL_ARM_MS);
  check(hotkeys.join() === "Ctrl+Alt+Y,Ctrl+Alt+N,Ctrl+Alt+T", "卡片可以操作后注册快捷键");
  await act(async () => { await emit("agent-approval-hotkey", { action: "deny" }); });
  await wait(50);
  check(last(decisions) === "k1:deny" && current() === null && hotkeys.length === 0, "按快捷键和点按钮一样，处理完释放快捷键");

  inFront = ["s1"];
  await send(request("f1", "s1"));
  await wait(50);
  check(last(decisions) === "f1:terminal" && island.mode === "collapsed", "会话窗口已在前台时直接交回终端，不弹");
  await act(async () => setWhenInFront(true));
  await send(request("f2", "s1"));
  await wait(50);
  check(current() === "f2" && island.page === "agents", "设置了「终端在前台时也弹出」时，前台会话的请求也弹卡片");
  await close("f2", "disconnected");
  await wait(50);
  await act(async () => setWhenInFront(false));
  inFront = [];

  await act(async () => setEnabled(false));
  await wait(50);
  check(!endpointEnabled, "勿扰或关掉岛上审批时，端点自己把请求交回终端");
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

  // Questions (AskUserQuestion, phase 3).
  await act(async () => setEnabled(true));
  await act(async () => setIsland({ mode: "collapsed", page: "todo" }));
  const DRINK = "你更喜欢哪种饮品？";
  const EXTRAS = "要加什么？";
  const drink = { question: DRINK, header: "饮品", multiSelect: false, options: [{ label: "咖啡", description: "提神" }, { label: "茶", description: "" }] };
  const extras = { question: EXTRAS, header: "", multiSelect: true, options: [{ label: "糖", description: "" }, { label: "奶", description: "" }, { label: "冰", description: "" }] };
  const ask = (name: string, questions: unknown[]) =>
    send(request(name, "s1", { kind: "question", toolName: "AskUserQuestion", toolInput: { questions } }));
  const option = (label: string, nth = 0) => {
    const item = document.querySelectorAll("#fixture .agent-question__item")[nth];
    return [...(item?.querySelectorAll<HTMLButtonElement>(".agent-question__option") ?? [])].find((entry) => entry.textContent?.endsWith(label));
  };
  const press = (key: string, target: EventTarget = window) =>
    act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });

  await ask("a1", [drink]);
  await wait(50);
  check(island.page === "agents" && document.querySelector("#fixture .agent-question") && !document.querySelector("#fixture .agent-approval__preview"), "提问弹出提问卡片，不是审批卡片");
  check(document.querySelector("#fixture .agent-question__text")?.textContent === `饮品${DRINK}`, "卡片显示问题和标题");
  await wait(APPROVAL_ARM_MS);
  check(hotkeys.join() === "Ctrl+Alt+T", "提问卡片只注册「到终端」的全局快捷键");
  await press("2");
  await wait(50);
  check(last(decisions) === "a1:answer" && answered?.[DRINK] === "茶", "只有一个单选问题时，按数字键直接提交那个选项");

  await ask("a2", [drink, extras]);
  await wait(APPROVAL_ARM_MS + 50);
  await click(option("咖啡"));
  const submitButton = () => button("提交");
  check(last(decisions) === "a1:answer" && submitButton()?.disabled, "有多个问题时选了不会马上提交，还有问题没答时「提交」不可点");
  await click(option("冰", 1));
  await click(option("糖", 1));
  await click(submitButton());
  await wait(50);
  check(last(decisions) === "a2:answer" && answered?.[DRINK] === "咖啡" && answered?.[EXTRAS] === "糖, 冰", "多选按选项顺序用逗号连起来，和其他问题一起提交");

  await ask("a3", [drink]);
  await wait(APPROVAL_ARM_MS + 50);
  const other = document.querySelector<HTMLInputElement>("#fixture .agent-question__other")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(other, "白开水就好");
    other.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check(submitButton() && !submitButton()!.disabled, "填了其他回答后出现「提交」");
  await press("Enter", other);
  await wait(50);
  check(last(decisions) === "a3:answer" && answered?.[DRINK] === "白开水就好", "在输入框按回车，把填的文字原样作为回答");

  await ask("a4", [drink]);
  await wait(APPROVAL_ARM_MS + 50);
  await click(button("到终端"));
  await wait(50);
  check(last(decisions) === "a4:terminal" && current() === null && island.mode === "collapsed", "提问也能交回终端，处理完岛屿收起");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
