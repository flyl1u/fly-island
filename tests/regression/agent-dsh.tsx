import { act } from "react";
import type { Root } from "react-dom/client";
import { I18nProvider } from "../../src/i18n";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";
import { QuotaAlertPopup } from "../../src/features/agent-status/QuotaAlertPopup";
import type { AgentSessionSummary, DshUsage } from "../../src/features/agent-status/api";
import { filterQuotaUsages, usageLineCount, type AgentUsages } from "../../src/features/agent-status/usage";

/** Fictional DSH data, shared by the Agent page's automated visual regression. */
export const DSH_USAGE: DshUsage = {
  updatedAt: Date.now(), available: true, source: "dshApi",
  wallets: [{ currency: "CNY", total: "12.3456", granted: "2.3456", toppedUp: "10.00" }],
};

export async function checkWorkbuddyRing(root: Root, sessions: AgentSessionSummary[], usages: AgentUsages,
  check: (condition: unknown, message: string) => void) {
  const data = { ...usages, dsh: DSH_USAGE, workbuddy: { remaining: 125.5, total: 500, updatedAt: usages.readAt } };
  const fixture = document.getElementById("fixture")!;
  fixture.style.setProperty("--island-font-scale", "1.2");
  const render = (visible: AgentUsages) => act(async () => {
    root.render(<I18nProvider><AgentSessionsPanel sessions={sessions} showUsage usages={visible} hostDisplay="icon" /></I18nProvider>);
  });
  await render(data);
  const rings = [...fixture.querySelectorAll<HTMLElement>(".agent-quota__agent")];
  const workbuddy = rings[3];
  check(rings.length === 4 && rings.every((ring) => Math.abs(ring.getBoundingClientRect().top - rings[0].getBoundingClientRect().top) < 1 &&
    ring.getBoundingClientRect().right <= fixture.getBoundingClientRect().right), "四个来源的额度环在最大字号下同排显示");
  check(workbuddy?.textContent === "125.5 积分" && workbuddy.getAttribute("aria-label")?.includes("剩余 125.5 / 500 积分") &&
    workbuddy.querySelectorAll(".quota-rings__track").length === 2 && workbuddy.querySelectorAll(".quota-rings__fill").length === 2,
    "WorkBuddy 内外两环随剩余比例一起变，显示官网剩余积分，详情可被读屏读取");
  // Every source draws the same two rings at Claude's size, whatever it knows.
  const box = (ring: HTMLElement) => ring.querySelector("svg")!.getBoundingClientRect();
  const radii = (ring: HTMLElement) => [...ring.querySelectorAll(".quota-rings__track")].map((circle) => circle.getAttribute("r")).join();
  check(rings.every((ring) => box(ring).width === box(rings[0]).width && box(ring).height === box(rings[0]).height && radii(ring) === radii(rings[0])),
    `四个来源的额度环一样大（${rings.map((ring) => `${box(ring).width}:${radii(ring)}`).join(" / ")}）`);
  check(getComputedStyle(workbuddy).getPropertyValue("--quota-base").trim() === "#43b4a5"
    && getComputedStyle(rings[2]).getPropertyValue("--quota-base").trim() === "#e8609a", "WorkBuddy 用青色，DSH 换成玫红");
  // A window past its reset (the app closed for a while) is unknown: still a whole, dim outer ring.
  await render({ ...data, claude: data.claude && { ...data.claude, fiveHour: null, sevenDay: { name: "", used: 40, resetsAt: null } } });
  const claude = fixture.querySelector<HTMLElement>(".agent-quota__agent--claudeCode");
  const outerFill = claude?.querySelector(".quota-rings__fill");
  check(outerFill?.getAttribute("r") === "10" && outerFill.classList.contains("quota-rings__fill--unknown") && box(claude!).width === box(rings[0]).width,
    "Claude 的 5 小时窗口未知时外环仍是完整的暗环，大小不变");
  const zero = filterQuotaUsages({ ...data, workbuddy: { ...data.workbuddy, remaining: 0 } }, ["workbuddy"]);
  await render(zero);
  check(fixture.querySelectorAll(".agent-quota__agent").length === 1 && fixture.querySelector(".agent-quota")?.textContent === "0 积分" &&
    !fixture.querySelector(".quota-rings__fill"), "只勾选 WorkBuddy 时，真实零余额显示空环");
  const none = filterQuotaUsages(data, []);
  await render(none);
  check(usageLineCount(none) === 0 && !fixture.querySelector(".agent-quota") && fixture.querySelectorAll(".agent-session").length === sessions.length,
    "全部取消后收掉额度行，会话列表仍显示");
  fixture.style.removeProperty("--island-font-scale");
}

export async function checkDsh(root: Root, sessions: AgentSessionSummary[], usages: AgentUsages,
  check: (condition: unknown, message: string) => void, focusCalls: Record<string, unknown>[]) {
  const dsh: AgentSessionSummary = { ...sessions[0], provider: "dsh", sessionId: "session-00000000-0000-4000-8000-000000000001",
    title: "Fictional DSH session", model: "deepseek-v4", effort: "high", permissionMode: null, subagents: 0,
    host: { name: "DeepSeek Harness", kind: "app", exe: null } };
  const data = { ...usages, dsh: DSH_USAGE };
  await act(async () => {
    root.render(<I18nProvider><AgentSessionsPanel sessions={[dsh, ...sessions.slice(1)]} showUsage usages={data} hostDisplay="both" /></I18nProvider>);
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  const rings = [...document.querySelectorAll<HTMLElement>(".agent-quota__agent")];
  const dshRing = document.querySelector<HTMLElement>(".agent-quota__agent--dsh");
  check(rings.length === 3 && rings.every((ring) => ring.getBoundingClientRect().top === rings[0].getBoundingClientRect().top), "DSH 与 Claude、Codex 的额度环同排显示");
  check(dshRing?.textContent === "¥12.3456" && !dshRing.textContent.includes("%") && dshRing.getAttribute("aria-label")?.includes("不代表百分比"), "DSH 显示真实余额，并向读屏说明环的可用性语义");
  check(dshRing?.getAttribute("role") === "img" && dshRing.tabIndex === 0 && dshRing.querySelectorAll(".quota-rings__fill").length === 2, "DSH 的余额环可聚焦，内外两圈都表示余额可用");
  const row = document.querySelector<HTMLButtonElement>(".agent-session");
  check(row?.querySelectorAll(".agent-provider-icon--dsh").length === 2 && row.querySelector(".agent-session__host")?.getAttribute("title") === "DeepSeek Harness", "DSH 会话和宿主都有独立标识");
  await act(async () => { row?.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
  const call = focusCalls[focusCalls.length - 1];
  check(call?.provider === "dsh" && call.sessionId === dsh.sessionId, "点击 DSH 会话使用现有聚焦命令并传递 DSH 会话 ID");
  for (const view of ["cards", "compact"] as const) {
    await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={[dsh]} view={view} hostDisplay="both" showUsage usages={{ claude: null, codex: null, dsh: DSH_USAGE, readAt: Date.now() }} /></I18nProvider>));
    check(document.querySelector(".agent-card .agent-provider-icon--dsh") && document.querySelector(".agent-quota__agent--dsh"), `DSH 在 ${view} 视图中显示卡片与余额`);
  }
  const community = { ...dsh, host: { name: "DSH Desktop (dataelement)", kind: "app" as const, exe: null } };
  await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={[community]} hostDisplay="both" /></I18nProvider>));
  check(document.querySelector(".agent-session__host-name")?.textContent === "DSH Desktop (dataelement)" &&
    document.querySelectorAll(".agent-provider-icon--dsh").length === 2, "社区 DSH 宿主显示具体程序名并保留 DS 图标");
  const fixture = document.getElementById("fixture");
  const originalWidth = fixture?.style.width ?? "";
  if (fixture) fixture.style.width = "280px";
  for (const view of ["list", "cards", "compact"] as const) {
    await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={[community]} view={view} hostDisplay="both" /></I18nProvider>));
    const host = document.querySelector<HTMLElement>(".agent-session__host");
    check(host && fixture && host.getBoundingClientRect().right <= fixture.getBoundingClientRect().right + 1,
      `社区 DSH 宿主在 280px ${view} 视图中不溢出`);
  }
  if (fixture) fixture.style.width = originalWidth;
  // DSH set up but unreadable: an empty ring with the reason, not a silently missing ring.
  const failed: AgentUsages = { claude: null, codex: null, dsh: null, dshProblem: "credential", readAt: Date.now() };
  await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={[dsh]} showUsage usages={failed} hostDisplay="both" /></I18nProvider>));
  const note = document.querySelector<HTMLElement>(".agent-quota__agent--problem");
  check(usageLineCount(failed) === 1 && note?.textContent === "未找到凭据" && note.getAttribute("aria-label")?.includes("重新登录") &&
    note.querySelectorAll(".quota-rings__fill--unknown").length === 2, "DSH 余额读不到时显示暗环（未知）和原因，不再一片空白");
  await act(async () => root.render(<I18nProvider><QuotaAlertPopup alert={{ kind: "low", agent: "dsh", window: "balance", used: 100, resetsAt: null }} /></I18nProvider>));
  check(document.querySelector("[role=status]")?.textContent === "DSH 余额不足", "DSH 余额预警不用订阅百分比文案");
}
