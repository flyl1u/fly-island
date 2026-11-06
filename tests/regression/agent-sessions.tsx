// pnpm dev, then open /tests/agent-sessions.html?test=1 (without ?test=1 the page is for visual QA;
// add &empty=1 to see the empty state, &rows=N to size it for N rows like the island does).
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { I18nProvider } from "../../src/i18n";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";
import type { AgentHostDisplay } from "../../src/features/appearance/types";
import type { AgentSessionSummary } from "../../src/features/agent-status/api";
import { getAgentPageExpandedHeight } from "../../src/windows/island/layout";

// Island padding, header and gap above the page content; see AGENT_PAGE_CHROME_HEIGHT in layout.ts.
const ISLAND_CHROME_HEIGHT = 86;
const fixture = document.getElementById("fixture")!;
const sizeFor = (rows: number) => { fixture.style.height = `${getAgentPageExpandedHeight(rows) - ISLAND_CHROME_HEIGHT}px`; };

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const params = new URLSearchParams(location.search);
const now = Date.now();
const focusCalls: Array<Record<string, unknown>> = [];
mockIPC((command, payload) => {
  if (command === "focus_agent_window") {
    const args = (payload ?? {}) as Record<string, unknown>;
    focusCalls.push(args);
    // Only the fly-island session has a window to switch to.
    return args.cwd === "E:\\Projects\\fly-island";
  }
  if (command === "get_agent_host_icon") {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  }
});

const SESSIONS: AgentSessionSummary[] = [
  {
    provider: "claudeCode", sessionId: "a", cwd: "E:\\Projects\\fly-island", title: "设置界面完善思路",
    model: "Opus 5.5", effort: "medium", phase: "running", updatedAt: now - 20_000, turnStartedAt: now - 200_000,
    // As long as the native side sends (120 characters), so it needs more than two lines.
    host: { name: "Orca", exe: "C:\\Apps\\orca\\Orca.exe", kind: "terminal" },
    lastMessage: "24 个测试全部通过。接下来用真实数据看看列表的实际效果和耗时，再决定要不要给第一句提问加缓存，顺便检查一下项目名是不是会话开始时的目录，以及跳转窗口时能不能按项目文件夹找到对应的编辑器窗口和终端窗口…",
  },
  {
    provider: "codex", sessionId: "b", cwd: "E:\\Projects\\MioPicFlow", title: "恢复 Windows 发布机环境，顺便把代理配置也整理一遍",
    model: "gpt-6-astra", effort: "high", phase: "waiting", updatedAt: now - 14 * 60_000, turnStartedAt: null,
    host: { name: "Codex", exe: null, kind: "app" },
    lastMessage: "关闭系统代理后国内网站立即恢复，说明问题集中在 Clash 的代理链路。",
  },
  {
    provider: "claudeCode", sessionId: "c", cwd: "E:\\Projects\\TixXinBlog", title: "Nexus 紧凑视口密度变量",
    model: "Opus 5.5", effort: null, phase: "completed", updatedAt: now - 95 * 60_000, lastMessage: null, host: null, turnStartedAt: now - 95 * 60_000 - 252_000,
  },
];

sizeFor(Number(params.get("rows")) || 3);
const root = createRoot(fixture);
const sessions = params.has("empty") ? [] : SESSIONS;
const render = async (hostDisplay: AgentHostDisplay, cards: { showElapsed?: boolean; showModel?: boolean } = {}) => {
  await act(async () => {
    root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={sessions} hostDisplay={hostDisplay} {...cards} /></I18nProvider></StrictMode>);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};
await render((params.get("host") as AgentHostDisplay | null) ?? "both");

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const rows = () => [...document.querySelectorAll<HTMLButtonElement>(".agent-session")];
const results = document.getElementById("results")!;

async function runChecks() {
  try {
    check(rows().length === 3, "列出全部会话");
    const [first, second, third] = rows();
    check(first.textContent?.includes("fly-island · 设置界面完善思路") && first.querySelector(".agent-provider-icon--claudeCode"), "每行显示图标、项目名和标题");
    check(first.querySelector(".agent-session__model")?.textContent === "Opus 5.5 · Medium", "显示模型和推理强度");
    check(first.classList.contains("agent-session--running") && second.classList.contains("agent-session--waiting") && third.classList.contains("agent-session--completed"), "状态灯按会话状态着色");
    const meta = (row: HTMLElement) => row.querySelector(".agent-session__meta")?.textContent;
    check(meta(second) === "等待确认 · 14 分钟前" && getComputedStyle(second.querySelector(".agent-session__dot")!).backgroundColor === "rgb(255, 159, 67)", "等待确认的会话显示橙色状态灯和状态文字");
    check(meta(first)?.startsWith("已运行 3 分 2") && !meta(first)?.includes("刚刚") && meta(third)?.endsWith("1 小时前"), "运行中的会话显示已运行多久，结束的显示多久前更新");
    check(first.classList.contains("agent-session--full") && second.classList.contains("agent-session--full") && third.classList.contains("agent-session--compact"), "进行中的会话展开，已完成的折叠成一行");
    check(third.firstElementChild?.classList.contains("agent-session__dot") && third.querySelector(".agent-provider-icon--claudeCode"), "折叠行以状态灯开头，图标挪到右侧");
    const title = second.querySelector<HTMLElement>(".agent-session__title")!;
    const message = first.querySelector<HTMLElement>(".agent-session__message")!;
    check(title.scrollWidth > title.clientWidth, "长标题单行省略");
    check(message.scrollHeight > message.clientHeight && message.clientHeight < 40, "最新回复最多两行");
    check(!third.querySelector(".agent-session__message") && !third.querySelector(".agent-session__model"), "折叠行不显示回复和模型");
    const panel = document.querySelector<HTMLElement>(".agent-sessions")!;
    check(panel.scrollWidth <= panel.clientWidth, "面板没有横向溢出");
    const list = document.querySelector<HTMLElement>(".agent-sessions__list")!;
    const rowHeights = rows().map((row) => row.getBoundingClientRect().height);
    check(rowHeights[0] === rowHeights[1] && rowHeights[2] < rowHeights[0] / 1.5, "展开行一样高，折叠行更矮");
    check(list.scrollHeight <= list.clientHeight, "设为 3 条时放下 3 个会话，不滚动");
    sizeFor(2);
    check(list.scrollHeight > list.clientHeight, "设为 2 条时第 3 个会话需要滚动");
    sizeFor(5);
    check(list.scrollHeight <= list.clientHeight, "设为 5 条时 3 个会话不滚动");
    sizeFor(3);

    check(first.querySelector(".agent-session__host")?.textContent?.startsWith("Orca") && first.querySelector("img.agent-session__host-icon"), "来源显示程序名和它自己的图标");
    check(first.querySelector(".agent-session__host")?.nextElementSibling?.classList.contains("agent-session__meta"), "来源排在标题行右侧、状态前面");
    check(second.querySelector("svg.agent-session__host-icon") && second.querySelector(".agent-session__host")?.textContent === "Codex", "没有程序文件的来源用通用图标");
    check(!third.querySelector(".agent-session__host"), "不知道来源时不显示");
    await render("icon");
    check(first.querySelector(".agent-session__host img") && !first.querySelector(".agent-session__host-name") && first.querySelector(".agent-session__host")?.getAttribute("title") === "Orca", "只显示图标时悬停可看名称");
    await render("name");
    check(first.querySelector(".agent-session__host-name")?.textContent === "Orca" && !first.querySelector(".agent-session__host-icon"), "只显示名称");
    await render("off");
    check(!document.querySelector(".agent-session__host"), "设为不显示时隐藏来源");
    await render("both");
    check(meta(third) === "用时 4 分 12 秒 · 1 小时前", "结束的会话显示这一轮用时");
    check(!second.querySelector(".agent-session__elapsed"), "不知道这一轮何时开始时不显示时长");
    const before = first.querySelector(".agent-session__elapsed")?.textContent;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    check(first.querySelector(".agent-session__elapsed")?.textContent !== before, "进行中的会话时长每秒更新");
    await render("both", { showElapsed: false, showModel: false });
    check(!document.querySelector(".agent-session__elapsed") && !document.querySelector(".agent-session__model"), "可以关掉运行时长和模型");
    await render("both");
    await render("both");

    await act(async () => { first.click(); await Promise.resolve(); });
    const lastCall = focusCalls[focusCalls.length - 1];
    check(lastCall?.provider === "claudeCode" && lastCall?.title === "设置界面完善思路", "点击会话按项目和标题查找窗口");
    check(typeof lastCall?.sessionId === "string" && lastCall.sessionId !== "", "点击会话时带上会话 ID，用来找它自己的窗口");
    check(!document.querySelector(".agent-session__not-found"), "找到窗口时不提示");
    await act(async () => { second.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    check(second.querySelector(".agent-session__not-found")?.textContent === "没找到对应的窗口", "找不到窗口时在该行提示");
    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
    console.error(error);
  }
}

if (params.has("test")) await runChecks();
else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  results.textContent = "点击会话查看跳转结果：只有 fly-island 会话能找到窗口。";
}
