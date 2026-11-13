import { act } from "react";
import type { Root } from "react-dom/client";
import { I18nProvider } from "../../src/i18n";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";
import { QuotaAlertPopup } from "../../src/features/agent-status/QuotaAlertPopup";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";

/** WorkBuddy desktop sessions on the Agent page: brand, host, model, state and the focus call. */
export async function checkWorkbuddySessions(root: Root, sessions: AgentSessionSummary[],
  check: (condition: unknown, message: string) => void, focusCalls: Record<string, unknown>[]) {
  const workbuddy: AgentSessionSummary = { ...sessions[0], provider: "workbuddy", sessionId: "00000000-0000-4000-8000-0000000000b1",
    title: "Fictional WorkBuddy session", model: "DeepSeek-V4.1-Flash", effort: null, phase: "running", permissionMode: null,
    subagents: 0, currentTool: { name: "Bash", detail: "ls" }, host: { name: "WorkBuddy", kind: "app", exe: null } };
  await act(async () => {
    root.render(<I18nProvider><AgentSessionsPanel sessions={[workbuddy, ...sessions.slice(1)]} hostDisplay="both" /></I18nProvider>);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  const row = document.querySelector<HTMLButtonElement>(".agent-session");
  check(row?.querySelectorAll(".agent-provider-icon--workbuddy").length === 2 && row.querySelector(".agent-session__host-name")?.textContent === "WorkBuddy",
    "WorkBuddy 会话和宿主都用 WorkBuddy 标识");
  check(row?.textContent?.includes("Fictional WorkBuddy session") && row.textContent.includes("DeepSeek-V4.1-Flash"), "WorkBuddy 会话显示标题和模型");
  await act(async () => { row?.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
  const call = focusCalls[focusCalls.length - 1];
  check(call?.provider === "workbuddy" && call.sessionId === workbuddy.sessionId, "点击 WorkBuddy 会话使用现有聚焦命令");
  for (const view of ["cards", "compact"] as const) {
    await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={[workbuddy]} view={view} hostDisplay="both" /></I18nProvider>));
    check(document.querySelector(".agent-provider-icon--workbuddy"), `WorkBuddy 在 ${view} 视图中显示`);
  }
  await act(async () => root.render(<I18nProvider><QuotaAlertPopup alert={{ kind: "low", agent: "workbuddy", window: "balance", used: 100, resetsAt: null }} /></I18nProvider>));
  check(document.querySelector("[role=status]")?.textContent === "WorkBuddy 积分已用完", "WorkBuddy 积分用完时的提醒文案");
}
