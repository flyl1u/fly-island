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
  if (command === "get_agent_usage") {
    return {
      updatedAt: now, plan: "Max 20x",
      fiveHour: { name: "", used: 27, resetsAt: now + 3 * 3_600_000 },
      sevenDay: { name: "", used: 62, resetsAt: now + 5 * 86_400_000 },
      models: [{ name: "Fable", used: 100, resetsAt: now + (34 * 60 + 10) * 60_000 }],
    };
  }
});

const SESSIONS: AgentSessionSummary[] = [
  {
    provider: "claudeCode", sessionId: "a", cwd: "E:\\Projects\\fly-island", title: "设置界面完善思路",
    model: "Opus 5.5", effort: "medium", phase: "running", updatedAt: now - 20_000, turnStartedAt: now - 200_000,
    permissionMode: "bypass", subagents: 2,
    // As long as the native side sends (120 characters), so it needs more than two lines.
    host: { name: "Orca", exe: "C:\\Apps\\orca\\Orca.exe", kind: "terminal" },
    lastMessage: "24 个测试全部通过。接下来用真实数据看看列表的实际效果和耗时，再决定要不要给第一句提问加缓存，顺便检查一下项目名是不是会话开始时的目录，以及跳转窗口时能不能按项目文件夹找到对应的编辑器窗口和终端窗口…",
  },
  {
    provider: "codex", sessionId: "b", cwd: "E:\\Projects\\MioPicFlow", title: "恢复 Windows 发布机环境，顺便把代理配置也整理一遍",
    model: "gpt-6-astra", effort: "high", phase: "waiting", updatedAt: now - 14 * 60_000, turnStartedAt: null, permissionMode: "default",
    host: { name: "Codex", exe: null, kind: "app" },
    lastMessage: "关闭系统代理后国内网站立即恢复，说明问题集中在 Clash 的代理链路。",
  },
  {
    provider: "claudeCode", sessionId: "c", cwd: "E:\\Projects\\TixXinBlog", title: "Nexus 紧凑视口密度变量",
    model: "Opus 5.5", effort: null, phase: "completed", permissionMode: "auto", subagents: 1, updatedAt: now - 95 * 60_000, lastMessage: null, host: null, turnStartedAt: now - 95 * 60_000 - 252_000,
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
    const dot = (row: HTMLElement) => getComputedStyle(row.querySelector(".agent-session__dot")!).backgroundColor;
    check(meta(second) === "等待确认 · 14 分" && dot(second) === "rgb(255, 69, 58)", "卡住等你的会话显示红色状态灯和状态文字");
    check(dot(first) === "rgb(52, 199, 89)" && dot(third) === "rgb(142, 142, 147)", "在跑的会话绿色，做完的灰色");
    check(meta(first)?.startsWith("已运行 3 分 2") && !meta(first)?.includes("刚刚") && meta(third)?.endsWith("1 小时"), "运行中的会话显示已运行多久，结束的显示多久前更新");
    check(first.classList.contains("agent-session--full") && second.classList.contains("agent-session--full") && third.classList.contains("agent-session--compact"), "进行中的会话展开，已完成的折叠成一行");
    check(rows().every((row) => row.firstElementChild?.classList.contains("agent-session__dot") && row.querySelector(".agent-session__heading .agent-provider-icon") && row.querySelectorAll(".agent-session__dot").length === 1), "每行都以状态灯开头，图标都在标题行右侧");
    const title = second.querySelector<HTMLElement>(".agent-session__title")!;
    const message = first.querySelector<HTMLElement>(".agent-session__message")!;
    check(title.scrollWidth > title.clientWidth, "长标题单行省略");
    check(message.scrollHeight > message.clientHeight && message.clientHeight < 40, "最新回复最多两行");
    check(!third.querySelector(".agent-session__message") && !third.querySelector(".agent-session__model"), "折叠行不显示回复和模型");
    check(first.querySelector(".agent-session__mode--bypass")?.textContent === "跳过确认" && meta(first)?.includes("2 个子 Agent"), "运行中的会话标出跳过确认的权限模式和正在跑的子 Agent 数");
    check(!second.querySelector(".agent-session__mode") && !third.querySelector(".agent-session__mode") && !meta(third)?.includes("子 Agent"), "默认权限模式和已结束的会话不显示这两项");
    const titleTone = (row: HTMLElement) => getComputedStyle(row.querySelector(".agent-session__title")!).color;
    const dimTitle = titleTone(third);
    const seenKeys: string[] = [];
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={sessions} hostDisplay="both" unseen={{ keys: new Set(["claudeCode:c"]), markSeen: (session) => seenKeys.push(session.sessionId) }} /></I18nProvider></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    check(third.classList.contains("agent-session--unseen") && titleTone(third) === titleTone(first) && titleTone(third) !== dimTitle && !first.classList.contains("agent-session--unseen"), "跑完还没看的会话标题保持亮色，看过的才变灰");
    // The fly-island session has a window, so clicking it leaves no "not found" note behind.
    first.click();
    check(seenKeys.join() === "a", "点开会话就算看过");
    const removedIds: string[] = [];
    let undone = 0;
    const renderRemoval = async (removed: AgentSessionSummary | null) => {
      await act(async () => {
        root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={sessions} hostDisplay="both"
          removal={{ remove: (session) => removedIds.push(session.sessionId), removed, undo: () => { undone += 1; } }} /></I18nProvider></StrictMode>);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    };
    await renderRemoval(null);
    const removeButtons = [...document.querySelectorAll<HTMLButtonElement>(".agent-session__remove")];
    const firstRow = rows()[0].getBoundingClientRect();
    const firstRemove = removeButtons[0].getBoundingClientRect();
    check(removeButtons.length === 3 && getComputedStyle(removeButtons[0]).opacity === "0"
      && Math.abs(firstRemove.right - firstRow.right) < 1 && firstRemove.width < 50, "每行右端有一个平时看不见的移除按钮");
    check(removeButtons[0].getAttribute("aria-label") === "从列表移除「设置界面完善思路」", "移除按钮的读屏文字说明移除哪个会话");
    const focusesBefore = focusCalls.length;
    removeButtons[2].click();
    check(removedIds.join() === "c" && focusCalls.length === focusesBefore, "点 × 只移除这个会话，不去切换窗口");
    await renderRemoval(sessions[2]);
    const notice = document.querySelector<HTMLElement>(".agent-sessions__removed");
    check(notice?.textContent?.startsWith("已从列表移除") && notice.getAttribute("role") === "status", "移除后显示「已从列表移除 · 撤销」");
    notice!.querySelector("button")!.click();
    check(undone === 1, "点撤销把会话放回去");
    await render("both");
    const panel = document.querySelector<HTMLElement>(".agent-sessions")!;
    check(panel.scrollWidth <= panel.clientWidth, "面板没有横向溢出");
    const list = document.querySelector<HTMLElement>(".agent-sessions__list")!;
    const rowHeights = rows().map((row) => row.getBoundingClientRect().height);
    check(rowHeights[0] === 78 && rowHeights[1] < rowHeights[0] - 10 && rowHeights[2] < rowHeights[1], "展开行随回复行数变高（两行 78px，一行更矮，不留空行），折叠行最矮");
    const font = (selector: string) => { const style = getComputedStyle(first.querySelector(selector)!); return `${style.fontSize} ${style.fontWeight}`; };
    check(font(".agent-session__title") === "14px 600" && font(".agent-session__message") === "13px 400" && font(".agent-session__meta") === "12px 400" && font(".agent-session__model") === "11px 400", "字号字重：标题 14/600，回复 13/400，状态 12/400，模型 11/400");
    check(list.scrollHeight <= list.clientHeight, "设为 3 条时放下 3 个会话，不滚动");
    check(Math.abs(list.getBoundingClientRect().bottom - (fixture.getBoundingClientRect().bottom + 20)) < 1, "列表一直延伸到岛屿底边，底部不留空白条");
    const afterLayout = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    await afterLayout();
    const masked = () => getComputedStyle(list).maskImage !== "none";
    check(!list.dataset.fadeTop && !list.dataset.fadeBottom && !masked(), "放得下时两头都不渐隐");
    sizeFor(2);
    await afterLayout();
    check(list.scrollHeight > list.clientHeight, "设为 2 条时第 3 个会话需要滚动");
    check(list.dataset.fadeBottom !== undefined && list.dataset.fadeTop === undefined && masked(), "下面还有会话时底部渐隐，顶部不渐隐");
    list.scrollTop = list.scrollHeight;
    await afterLayout();
    check(list.dataset.fadeTop !== undefined && list.dataset.fadeBottom === undefined, "滚到底后顶部渐隐，底部不再渐隐");
    list.scrollTop = 0;
    sizeFor(5);
    await afterLayout();
    check(list.scrollHeight <= list.clientHeight, "设为 5 条时 3 个会话不滚动");
    sizeFor(3);

    check(first.querySelector(".agent-session__host")?.textContent?.startsWith("Orca") && first.querySelector("img.agent-session__host-icon"), "来源显示程序名和它自己的图标");
    check(first.querySelector(".agent-session__meta")?.nextElementSibling?.classList.contains("agent-session__host") && first.querySelector(".agent-session__heading")?.lastElementChild?.classList.contains("agent-provider-icon"), "标题行右侧依次是状态、来源、Agent 图标");
    check(second.querySelector("svg.agent-session__host-icon") && second.querySelector(".agent-session__host")?.textContent === "Codex", "没有程序文件的来源用通用图标");
    check(!third.querySelector(".agent-session__host"), "不知道来源时不显示");
    await render("icon");
    check(first.querySelector(".agent-session__host img") && !first.querySelector(".agent-session__host-name") && document.querySelectorAll("[title]").length === 0, "只显示图标，不弹悬停提示");
    check(third.querySelector(".agent-session__host--unknown"), "只显示图标时，不知道来源也留出图标位");
    await render("icon", { showElapsed: false });
    const iconRight = (row: HTMLElement) => row.querySelector(".agent-provider-icon")!.getBoundingClientRect().right;
    check(meta(first) === "2 个子 Agent · 刚刚" && meta(third) === "1 小时" && Math.abs(iconRight(first) - iconRight(third)) < 0.5 && Math.abs(iconRight(first) - iconRight(second)) < 0.5, "时间长短不同、有无来源时，右侧图标仍在同一列");
    // The fixture is the island's content box; the island's edge is its 20px side padding further out.
    const dotGap = first.querySelector(".agent-session__dot")!.getBoundingClientRect().left - (fixture.getBoundingClientRect().left - 20);
    check(dotGap > 8 && dotGap < 16, "列表两侧只留很窄的边距（距岛屿边缘约 12px）");
    await render("name");
    check(first.querySelector(".agent-session__host-name")?.textContent === "Orca" && !first.querySelector(".agent-session__host-icon"), "只显示名称");
    await render("off");
    check(!document.querySelector(".agent-session__host"), "设为不显示时隐藏来源");
    await render("both");
    check(meta(third) === "用时 4 分 12 秒 · 1 小时", "结束的会话显示这一轮用时");
    check(!second.querySelector(".agent-session__elapsed"), "不知道这一轮何时开始时不显示时长");
    const before = first.querySelector(".agent-session__elapsed")?.textContent;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1100)); });
    check(first.querySelector(".agent-session__elapsed")?.textContent !== before, "进行中的会话时长每秒更新");
    await render("both", { showElapsed: false, showModel: false });
    check(!document.querySelector(".agent-session__elapsed") && !document.querySelector(".agent-session__model"), "可以关掉运行时长和模型");
    await act(async () => {
      const turnJustStarted = [{ ...SESSIONS[0], lastMessage: null }, ...SESSIONS.slice(1)];
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={turnJustStarted} hostDisplay="both" /></I18nProvider></StrictMode>);
    });
    check(rows()[0].classList.contains("agent-session--compact") && rows()[0].querySelector(".agent-session__model") && rows()[0].getBoundingClientRect().height < 40, "刚开始一轮、还没有回复的会话不留空白第二行");
    await render("both");
    await render("both");
    const titleColor = () => getComputedStyle(rows()[0].querySelector(".agent-session__title")!).color;
    check(titleColor() === "rgba(241, 240, 246, 0.96)", "深色岛屿背景上标题是浅色字");
    fixture.style.setProperty("--island-ink-rgb", "24, 24, 30");
    check(titleColor() === "rgba(24, 24, 30, 0.96)", "浅色岛屿背景上标题换成深色字");
    fixture.style.removeProperty("--island-ink-rgb");

    const withActivity: AgentSessionSummary[] = [
      { ...SESSIONS[0], lastPrompt: "发个 0.5.3 补丁版并升级线上", currentTool: { name: "Bash", detail: "git push origin main && gh run watch --exit-status" } },
      { ...SESSIONS[1], lastPrompt: "恢复发布机环境" },
      SESSIONS[2],
    ];
    const renderActivity = async (showActivity: boolean) => {
      await act(async () => {
        root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={withActivity} hostDisplay="both" showActivity={showActivity} /></I18nProvider></StrictMode>);
      });
    };
    await renderActivity(true);
    const [running, waiting] = rows();
    check(running.querySelector(".agent-session__prompt")?.textContent === "你：发个 0.5.3 补丁版并升级线上"
      && running.querySelector(".agent-session__tool-name")?.textContent === "Bash"
      && running.querySelector(".agent-session__tool-detail")?.textContent?.startsWith("git push")
      && !running.querySelector(".agent-session__message"), "运行中的会话显示最近提问和正在调用的工具");
    const reply = waiting.querySelector<HTMLElement>(".agent-session__message");
    check(waiting.querySelector(".agent-session__prompt") && reply && reply.clientHeight < 25 && !waiting.querySelector(".agent-session__tool"), "没有工具时提问下面接一行回复");
    check(running.getBoundingClientRect().height === 78 && waiting.getBoundingClientRect().height === 78, "提问加一行内容的行和两行回复一样高（78px）");
    await renderActivity(false);
    check(!document.querySelector(".agent-session__prompt") && !document.querySelector(".agent-session__tool") && rows()[0].querySelector(".agent-session__message"), "关掉后只显示回复");

    check(!document.querySelector(".agent-usage"), "没打开用量时不显示用量行");
    fixture.style.height = `${getAgentPageExpandedHeight(3, true) - ISLAND_CHROME_HEIGHT}px`;
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={sessions} hostDisplay="both" showUsage /></I18nProvider></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const usage = document.querySelector<HTMLElement>(".agent-usage");
    const values = [...document.querySelectorAll<HTMLElement>(".agent-usage__value")];
    check(usage?.textContent?.includes("5 小时27%") && usage.textContent.includes("7 天62%") && usage.textContent.includes("Fable100%"), "顶部显示 5 小时、7 天和各模型的用量");
    check(values.map((value) => value.className.replace("agent-usage__value agent-usage__value--", "")).join() === "low,medium,high", "用量按多少分绿、橙、红");
    check(usage?.textContent?.includes("1 天 10 小时后重置"), "显示最紧的那个窗口何时重置");
    const usageList = document.querySelector<HTMLElement>(".agent-sessions__list")!;
    check(usageList.scrollHeight <= usageList.clientHeight + 1, "加上用量行后，设为 3 条时仍放下 3 个会话");
    check(usage!.getBoundingClientRect().width > usageList.getBoundingClientRect().width - 20, "悬停卡片的外壳不改变用量行的宽度");
    // The pointer in the middle of the line, right where a centred card would sit under it.
    const line = usage!.getBoundingClientRect();
    const clear = (pointer: number) => {
      const box = document.querySelector<HTMLElement>(".island-hover-card")!.getBoundingClientRect();
      return box.right <= pointer - 8 || box.left >= pointer + 22;
    };
    let pointer = line.left + line.width / 2;
    await act(async () => { usage!.parentElement!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: pointer, clientY: line.top + 10 })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
    const usageCard = document.querySelector<HTMLElement>(".island-hover-card");
    check(usageCard?.textContent?.includes("· 来自 claude-hud") && usageCard.getBoundingClientRect().top >= usage!.getBoundingClientRect().bottom
      && usageCard.getBoundingClientRect().top < usage!.getBoundingClientRect().bottom + 20, `悬停用量行时，行下方的卡片写出更新时间和来源：${usageCard?.textContent}`);
    check(clear(pointer), "卡片避开鼠标指针");
    pointer = line.left + 20;
    await act(async () => { usage!.parentElement!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: pointer, clientY: line.top + 10 })); });
    check(clear(pointer), "鼠标沿着用量行移动时，卡片继续避开指针");
    await act(async () => { usage!.parentElement!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body })); });

    // Codex reporting limits too: a second line, and the page sized for both.
    const readAt = Date.now();
    const usages = {
      claude: { updatedAt: readAt, plan: null, fiveHour: { name: "", used: 27, resetsAt: null }, sevenDay: null, models: [] },
      codex: { updatedAt: readAt, plan: "Plus", source: "codex" as const, fiveHour: { name: "", used: 9, resetsAt: null }, sevenDay: { name: "", used: 91, resetsAt: readAt + 2 * 86_400_000 }, models: [] },
      readAt,
    };
    fixture.style.height = `${getAgentPageExpandedHeight(3, 2) - ISLAND_CHROME_HEIGHT}px`;
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={sessions} hostDisplay="both" showUsage usages={usages} /></I18nProvider></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const lines = [...document.querySelectorAll<HTMLElement>(".agent-usage")];
    check(lines.length === 2 && lines[1].getAttribute("aria-label") === "Codex 用量" && lines[1].textContent?.includes("7 天91%"), "Codex 也报告额度时，Claude 下面多一行 Codex 用量");
    const twoLineList = document.querySelector<HTMLElement>(".agent-sessions__list")!;
    check(twoLineList.scrollHeight <= twoLineList.clientHeight + 1, "两行用量时，设为 3 条仍放下 3 个会话");
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={sessions} hostDisplay="both" showUsage usages={{ ...usages, claude: null }} /></I18nProvider></StrictMode>);
    });
    check(document.querySelectorAll(".agent-usage").length === 1 && document.querySelector(".agent-usage")?.getAttribute("aria-label") === "Codex 用量", "只有 Codex 有额度时只显示 Codex 一行");
    sizeFor(3);
    await render("both");

    await act(async () => { first.click(); await Promise.resolve(); });
    const lastCall = focusCalls[focusCalls.length - 1];
    check(lastCall?.provider === "claudeCode" && lastCall?.title === "设置界面完善思路", "点击会话按项目和标题查找窗口");
    check(typeof lastCall?.sessionId === "string" && lastCall.sessionId !== "", "点击会话时带上会话 ID，用来找它自己的窗口");
    check(!document.querySelector(".agent-session__not-found"), "找到窗口时不提示");
    await act(async () => { second.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    check(second.querySelector(".agent-session__not-found")?.textContent === "没找到对应的窗口", "找不到窗口时在该行提示");
    await act(async () => { third.click(); await new Promise((resolve) => setTimeout(resolve, 20)); });
    check(third.querySelector(".agent-session__not-found")?.textContent === "没找到对应的窗口，会话可能已经关掉了", "已结束的会话找不到窗口时说明可能已关掉");

    // A finished reply that asks something: yellow and named, without the reply status marker.
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={[{ ...SESSIONS[2], sessionId: "d", replyAsks: true }]} hostDisplay="both" /></I18nProvider></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const asking = rows()[0];
    check(asking.classList.contains("agent-session--light-yourTurn") && dot(asking) === "rgb(255, 214, 10)" && meta(asking)?.startsWith("等你回复"),
      `回复以问句结尾的会话显示黄色状态灯和「等你回复」：${meta(asking)}`);
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={[{ ...SESSIONS[0], sessionId: "e", compacting: true }]} hostDisplay="both" /></I18nProvider></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const compacting = rows()[0];
    check(meta(compacting)?.startsWith("正在压缩上下文") && dot(compacting) === "rgb(52, 199, 89)", `压缩上下文时写明，状态灯仍是绿色：${meta(compacting)}`);
    // Last: it swaps the list for one remote row, which the checks above would not find.
    const remote: AgentSessionSummary = {
      ...sessions[0], sessionId: "local-api/r-1", provider: "codex", cwd: "/srv/app", title: "服务器上的会话",
      host: { name: "dev-box", exe: null, kind: "remote" }, remoteHost: "dev-box",
    };
    await act(async () => {
      root.render(<StrictMode><I18nProvider><AgentSessionsPanel sessions={[remote]} hostDisplay="both" /></I18nProvider></StrictMode>);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    check(rows()[0].querySelector(".agent-session__host")?.textContent === "dev-box" && rows()[0].querySelector("svg.agent-session__host-icon"), "远程会话显示主机名和服务器图标");
    const remoteFocuses = focusCalls.length;
    await act(async () => rows()[0].click());
    check(focusCalls.length === remoteFocuses && rows()[0].querySelector(".agent-session__not-found")?.textContent === "在 dev-box 上运行，这里没有它的窗口",
      "点远程会话不去找本地窗口，只说明它在哪台机器上");
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
