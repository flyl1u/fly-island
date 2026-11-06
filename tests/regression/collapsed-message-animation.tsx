// pnpm dev, then open /tests/collapsed-message-animation.html?test=1.
import { act, StrictMode, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { emit } from "@tauri-apps/api/event";
// Loads the island stylesheets in the same order as the app.
import "../../src/windows/island/IslandApp";
import { IslandShell } from "../../src/windows/island/IslandShell";
import type { IslandMode } from "../../src/windows/island/types";
import { useQQNotifications } from "../../src/features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../src/features/messages/wechat/WeChatReminders";
import { useMail } from "../../src/features/messages/mail/MailPanel";
import type { MailSnapshot } from "../../src/features/messages/mail/api";
import type { MessageSource } from "../../src/features/messages/messagePreview";
import type { MediaState } from "../../src/features/media/api";
import type { AgentSession } from "../../src/features/agent-status/session";
import type { DeviceUse } from "../../src/features/device-use/api";
import type { LevelChange } from "../../src/features/system-levels/api";
import type { DeviceAlert } from "../../src/features/device-events/api";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const automated = new URLSearchParams(location.search).has("test");
// Same values as MediaState::empty() in src-tauri/src/media_control/session.rs.
const UNAVAILABLE_MEDIA: MediaState = {
  available: false, audioActive: false, audioPeak: 0, playbackStatus: "unavailable",
  title: null, artist: null, album: null, thumbnail: null, positionMs: 0, durationMs: 0,
  canSeek: false, canNext: false, canPrevious: false, shuffleActive: null, canShuffle: false,
  repeatMode: "unknown", canRepeat: false, volume: -1, sourceApp: null, activeSessionId: null,
  sessions: [], updatedAt: 0,
};
async function update(action: () => void | Promise<void>) {
  if (automated) await act(action);
  else await action();
}
const keys = ["focusd-island-qq-notifications-enabled", "focusd-island-wechat-reminders-enabled", "focusd-island-qq-notification-access-requested", "focusd-island-qq-mail-settings"];
const originals = keys.map((key) => localStorage.getItem(key));
keys.forEach((key) => localStorage.removeItem(key));
function restoreStorage() {
  keys.forEach((key, index) => originals[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, originals[index]!));
}
window.addEventListener("beforeunload", restoreStorage);

let revision = 0;
const commands: string[] = [];
let mail: MailSnapshot = {
  revision: 0, email: "island-test@qq.com", configured: true, enabled: true, syncing: false,
  status: "connected", unreadCount: 0, items: [], lastSyncedAt: null, error: null,
};
mockIPC((command, payload) => {
  commands.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "request_qq_notification_access") return "allowed";
  if (command === "set_qq_notifications_enabled") return {
    revision: ++revision, enabled: args.enabled, status: "listening", items: [], error: null,
  };
  if (command === "set_wechat_reminders_enabled") return {
    revision: ++revision, enabled: args.enabled, status: "listening", pending: false, lastAttentionAt: null, error: null,
  };
  if (command === "get_qq_mail_state") return [mail];
  if (command === "read_qq_mail") return { id: args.messageId, content: "本周项目进度已更新", contentType: "text/plain" };
}, { shouldMockEvents: true });

let changeMode: (mode: IslandMode) => void;
let changeTucked: (tucked: boolean) => void;
let changeCount: (count: number) => void;
let changeTask: (task: string | null) => void;
let changeWidth: (width: number) => void;
let changeTitle: (show: boolean) => void;
let changeFont: (pixel: boolean) => void;
let changeAgent: (session: AgentSession | null) => void;
let changeAgentCount: (count: number) => void;
let changeAgentsEnabled: (enabled: boolean) => void;
let changeDeviceUse: (deviceUse: DeviceUse) => void;
let changeLevel: (change: LevelChange | null) => void;
let changeDeviceAlert: (alert: DeviceAlert | null) => void;
let openedPage: string | null = null;

function Fixture() {
  const [mode, setMode] = useState<IslandMode>("collapsed");
  const [tucked, setTucked] = useState(false);
  const [count, setCount] = useState(3);
  const [task, setTask] = useState<string | null>(null);
  const [width, setWidth] = useState(280);
  const [title, setTitle] = useState(false);
  const [pixel, setPixel] = useState(false);
  const [agent, setAgent] = useState<AgentSession | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [agentsEnabled, setAgentsEnabled] = useState(true);
  const [deviceUse, setDeviceUse] = useState<DeviceUse>({ camera: [], microphone: [] });
  changeDeviceUse = setDeviceUse;
  const [level, setLevel] = useState<LevelChange | null>(null);
  changeLevel = setLevel;
  const [deviceAlert, setDeviceAlert] = useState<DeviceAlert | null>(null);
  changeDeviceAlert = setDeviceAlert;
  changeAgentCount = setAgentCount; changeAgentsEnabled = setAgentsEnabled;
  const canPreview = mode === "collapsed" && !tucked;
  const qq = useQQNotifications(canPreview);
  const wechat = useWeChatReminders(canPreview);
  const qqMail = useMail(canPreview);
  changeMode = setMode; changeTucked = setTucked; changeCount = setCount; changeTask = setTask;
  changeWidth = setWidth; changeTitle = setTitle; changeFont = setPixel; changeAgent = setAgent;
  return <div className={`stage${pixel ? " stage--font-pixel" : ""}`} style={{ "--collapsed-island-width": `${width}px` } as CSSProperties}>
    <IslandShell deviceUse={deviceUse} levelPopup={level} deviceAlert={deviceAlert} qqNotifications={qq} wechatReminders={wechat} qqMail={qqMail} pluginNotifications={{ notification: null, dismiss: () => {}, runAction: () => {} }}
      mode={mode} page="todo" isTucked={tucked} isDetached={true} showTitle={title}
      showCollapsedText={true} collapsedTaskTitle={task ?? `剩余${count}个待办`} collapsedTodoCount={null} agentSession={agent} activeAgentSessionCount={agentCount}
      appearanceMode="classic" nativeGlassState="disabled" agentVisualState="idle" agentStatusLabel="AI Agent 空闲或已完成"
      mediaState={UNAVAILABLE_MEDIA}
      features={{ todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: true, qqMail: true, agents: agentsEnabled, translation: false }}
      shelfCount={null}
      onOpenPage={(page) => { openedPage = page; }} onOpenMessages={(source) => { openedPage = source; }}
      onPageChange={() => {}} onWindowDragStart={() => {}} onCollapse={() => setMode("collapsed")}
      onResetPosition={() => {}} minimizesToTray onMinimize={() => {}} onOpenSettings={() => {}} onOpenTranslator={() => {}} translationPeek={null} onOpenTranslationPeek={() => {}} onTuck={() => setTucked(true)} onReveal={() => setTucked(false)} pageDigitModifiers="Alt">
      <span>待办清单</span>
    </IslandShell>
  </div>;
}

async function notify(source: MessageSource, long = false, visible = true) {
  const receivedAt = Date.now();
  await update(async () => {
    if (source === "wechat") await emit("wechat-reminder-changed", {
      snapshot: { revision: ++revision, enabled: true, status: "listening", pending: true, lastAttentionAt: revision, error: null }, windowVisible: visible,
    });
    if (source === "qq") await emit("qq-notifications-changed", {
      snapshot: { revision: ++revision, enabled: true, status: "listening", items: [{ id: `qq-${revision}`, title: long ? "这是一位名字特别特别长的好友" : "小林", body: long ? "明天下午三点一起讨论新项目的设计方案，记得带上之前整理的资料。" : "下午一起开会吗？", createdAt: receivedAt }], error: null }, newestId: `qq-${revision}`, windowVisible: visible,
    });
    if (source === "qqMail") {
      mail = { ...mail, revision: ++revision, unreadCount: 1, items: [{ id: `mail-${revision}`, uid: revision, sender: "项目组", subject: long ? "本周项目进度和下阶段设计评审安排，请查收附件中的完整说明" : "本周项目进度已更新", unread: true, receivedAt }] };
      await emit("qq-mail-changed", { snapshot: mail, newestId: `mail-${revision}`, windowVisible: visible });
    }
  });
}

const summary = () => document.querySelector<HTMLElement>(".island__summary")!;
const incoming = () => summary().lastElementChild as HTMLElement;
const button = () => document.querySelector<HTMLButtonElement>(".island__open-button")!;
const messages: string[] = [];
const matchMedia = window.matchMedia.bind(window);
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
async function waitFor(condition: () => boolean, label: string, timeout = 1500) {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`等待超时：${label}`);
    await act(async () => { await new Promise(requestAnimationFrame); });
  }
}
const settle = () => waitFor(() => summary().children.length === 1 && !summary().querySelector(".island__summary-layer--incoming"), "动画完成");
const results = document.getElementById("results")!;

async function runChecks() {
  const runButton = document.getElementById("run-checks") as HTMLButtonElement;
  runButton.disabled = true;
  messages.length = 0;
  try {
    check(incoming().textContent?.includes("剩余3个待办"), "初始待办直接可读，无首次闪动");
    const width = document.querySelector(".island")!.getBoundingClientRect().width;
    await notify("qq", true);
    check(summary().children.length === 2 && summary().firstElementChild?.textContent?.includes("剩余3个待办"), "待办退场时保留原文字");
    check(button().getAttribute("aria-label")?.includes("名字特别特别长"), "QQ 完整好友名与消息保留在无障碍标签中");
    await settle();
    const sender = summary().querySelector<HTMLElement>(".island-message-preview__sender")!;
    const body = summary().querySelector<HTMLElement>(".island-message-preview__body")!;
    check(sender.scrollWidth > sender.clientWidth && body.scrollWidth > body.clientWidth && body.clientWidth > 40, "280px 岛屿内长好友名与长消息分别省略");
    const messageStyle = getComputedStyle(summary().querySelector(".island-message-preview")!);
    check(Number.parseFloat(messageStyle.fontSize) >= 13 && Number(messageStyle.fontWeight) >= 600, "消息使用更清晰的字号和中粗字重");
    check(document.querySelector(".island")!.getBoundingClientRect().width === width, "消息不会撑宽岛屿");
    const sameRow = incoming();
    await act(async () => changeCount(2));
    check(incoming() === sameRow && summary().children.length === 1, "无关状态更新不重播消息动画");
    await notify("wechat");
    check(incoming().textContent === "你收到了一条消息" && incoming().querySelector(".message-brand-icon--wechat"), "微信仅显示图标和简洁提醒");
    const enteringWeChat = incoming();
    const entrance = enteringWeChat.firstElementChild!.getAnimations()[0];
    await notify("qqMail");
    check(summary().children.length === 2 && summary().firstElementChild?.textContent === "你收到了一条消息", "动画中被新来源打断时仅保留上一条和最新一条");
    check(entrance && summary().firstElementChild === enteringWeChat && enteringWeChat.firstElementChild!.getAnimations()[0] === entrance, "快速交接沿用原内容的运动进度，不跳回起点");
    check(incoming().textContent === "本周项目进度已更新" && incoming().querySelector(".message-brand-icon--qqMail"), "邮箱显示图标和邮件摘要");
    await settle();
    await act(async () => button().click());
    check(commands.includes("plugin:opener|open_url") || commands.includes("read_qq_mail"), "点击邮件仍进入现有邮件查看入口");
    check(incoming().textContent?.includes("剩余2个待办"), "新消息关闭后恢复最新待办数，不回放旧来源");
    await notify("wechat");
    check(incoming().textContent === "你收到了一条消息", "恢复动画途中收到新消息会立即交接，不被旧清理覆盖");
    await settle();
    await waitFor(() => !button().getAttribute("aria-label")?.includes("点击打开微信"), "五秒自动恢复", 6000);
    check(incoming().textContent?.includes("剩余2个待办"), "通知停留五秒后自动恢复待办");
    await settle();
    await act(async () => { changeTask("完成今日设计评审"); changeTitle(true); changeFont(true); });
    await notify("qqMail", true);
    await settle();
    const pixelMessageStyle = getComputedStyle(summary().querySelector(".island-message-preview")!);
    check(!pixelMessageStyle.fontFamily.includes("Fusion Pixel") && Number(pixelMessageStyle.fontWeight) >= 600, "像素主题中的消息仍使用清晰的系统中粗字体");
    await act(async () => button().click());
    await settle();
    check(incoming().textContent?.includes("fly-island") && incoming().textContent?.includes("完成今日设计评审"), "像素字体和标题开启时恢复当前专注任务");
    await notify("qq");
    await act(async () => changeMode("expanded"));
    check(summary().children.length === 1 && !summary().querySelector(".island-message-preview"), "展开立即清除消息动画和离场内容");
    await notify("wechat");
    await act(async () => changeMode("collapsed"));
    check(!summary().querySelector(".island-message-preview"), "展开期间的消息不在重新收起后回放");
    await act(async () => changeTucked(true));
    await notify("qq");
    await act(async () => changeTucked(false));
    check(!summary().querySelector(".island-message-preview"), "边缘收起期间不播放预览");
    await notify("qqMail", false, false);
    check(!summary().querySelector(".island-message-preview"), "托盘隐藏时只更新收件状态");
    window.matchMedia = (query) => query === "(prefers-reduced-motion: reduce)"
      ? { ...matchMedia(query), matches: true } : matchMedia(query);
    await notify("wechat");
    check(summary().children.length === 1 && !summary().querySelector(".island__summary-layer--incoming"), "减少动态效果时新消息直接可读且无离场残留");
    await act(async () => button().click());
    check(commands.includes("open_wechat") && !summary().querySelector(".island-message-preview"), "减少动态效果时点击微信并立即恢复专注任务");
    window.matchMedia = matchMedia;
    await act(async () => button().click());
    check(openedPage === "todo", "恢复后点击原文字仍打开待办");
    await act(async () => { changeTask(null); changeTitle(false); changeFont(false); changeAgent({ provider: "claudeCode", label: "Claude Code", title: "设置界面完善思路：把外观、通用和 AI Agent 分开" }); });
    await settle();
    const agentRow = summary().querySelector<HTMLElement>(".island__agent-session");
    const agentTitle = agentRow?.querySelector<HTMLElement>(".island__agent-session-title");
    check(agentRow?.querySelector(".agent-provider-icon--claudeCode") && agentTitle && !incoming().textContent?.includes("完成今日设计评审"), "Agent 运行时显示图标和会话标题，代替待办");
    check(agentTitle!.scrollWidth > agentTitle!.clientWidth && agentTitle!.clientWidth > 40, "280px 岛屿内长会话标题省略且不挤掉图标");
    check(document.querySelector(".island")!.getAttribute("aria-label")?.includes("Claude Code"), "无障碍标签说明是哪个 Agent");
    await notify("qq");
    check(incoming().querySelector(".island-message-preview") && !incoming().querySelector(".island__agent-session"), "消息预览优先于 Agent 标题");
    await act(async () => button().click());
    await settle();
    check(incoming().querySelector(".agent-provider-icon--claudeCode"), "预览结束后回到 Agent 标题");
    await act(async () => changeAgent({ provider: "codex", label: "Codex", title: "恢复 Windows 发布机环境" }));
    await settle();
    check(incoming().querySelector(".agent-provider-icon--codex") && incoming().textContent?.includes("恢复 Windows 发布机环境"), "切换为 Codex 会话时更换图标和标题");
    await act(async () => changeAgent(null));
    await settle();
    check(!summary().querySelector(".island__agent-session") && incoming().textContent?.includes("剩余2个待办"), "Agent 结束后恢复待办");
    await act(async () => changeAgent({ provider: "claudeCode", label: "Claude Code", title: "插件市场功能" }));
    await settle();
    await act(async () => button().click());
    check(openedPage === "agents", "显示 Agent 标题时点击小岛打开 Agent 页");
    const agentCount = () => document.querySelector<HTMLButtonElement>(".island-agent-count");
    const tuckDot = () => document.querySelector(".island__quiet-button");
    check(!agentCount() && !tuckDot(), "AI Agent 开启且没有运行中的会话时不显示灰点和数量");
    await act(async () => changeAgentCount(2));
    check(agentCount()?.textContent === "2" && !tuckDot() && agentCount()?.getAttribute("aria-label")?.includes("2"), "运行中的会话数量代替灰点");
    openedPage = null;
    await act(async () => agentCount()!.click());
    check(openedPage === "agents", "点击会话数量打开 Agent 页");
    await act(async () => { changeAgentsEnabled(false); changeAgent(null); });
    await settle();
    check(tuckDot() && !agentCount(), "AI Agent 关闭时保留收起灰点");
    await act(async () => { button().click(); });
    check(openedPage === "todo", "没有 Agent 标题时点击小岛仍打开原页面");
    const cursorOf = (selector: string) => { const element = document.querySelector(selector); return element ? getComputedStyle(element).cursor : "missing"; };
    check(cursorOf(".island--collapsed") === "default" && cursorOf(".island__open-button") === "default",
      `收起的岛屿用普通鼠标样式（${cursorOf(".island--collapsed")} / ${cursorOf(".island__open-button")}）`);
    check(cursorOf(".island__quiet-button") === "pointer", "岛屿上的小按钮仍是可点击的手形");
    const islandWidth = document.querySelector(".island")!.getBoundingClientRect().width;
    const deviceButtons = () => [...document.querySelectorAll<HTMLButtonElement>(".device-use__button")];
    check(deviceButtons().length === 0, "没有程序用摄像头和麦克风时不显示图标");
    await act(async () => changeDeviceUse({ camera: ["Zoom"], microphone: ["Teams", "Zoom"] }));
    const [camera, microphone] = deviceButtons();
    check(camera?.classList.contains("device-use__button--camera") && microphone?.classList.contains("device-use__button--microphone")
      && getComputedStyle(camera).color === "rgb(53, 233, 133)" && getComputedStyle(microphone).color === "rgb(255, 159, 67)", "摄像头绿色、麦克风橙色，摄像头在前");
    check(microphone?.getAttribute("aria-label") === "Teams、Zoom 正在使用麦克风，点击打开隐私设置", "无障碍标签列出正在使用的程序");
    check(document.querySelector(".island")!.getBoundingClientRect().width === islandWidth, "图标不会撑宽岛屿");
    openedPage = null;
    await act(async () => camera.click());
    check(commands.includes("open_device_privacy_settings") && openedPage === null, "点击图标打开系统隐私设置，不展开岛屿");
    await act(async () => changeDeviceUse({ camera: [], microphone: [] }));
    check(deviceButtons().length === 0, "程序用完后图标消失");
    await act(async () => changeLevel({ kind: "volume", level: 0.42, muted: false }));
    await settle();
    const popup = () => document.querySelector<HTMLElement>(".level-popup");
    check(popup()?.getAttribute("aria-label") === "音量 42%" && popup()?.querySelector(".level-popup__value")?.textContent === "42"
      && document.querySelector(".island")!.getBoundingClientRect().width === islandWidth, "调音量时显示音量图标、进度条和百分比，不撑宽岛屿");
    const fill = popup()!.querySelector<HTMLElement>(".level-popup__fill")!;
    const track = popup()!.querySelector<HTMLElement>(".level-popup__track")!;
    check(Math.abs(fill.getBoundingClientRect().width / track.getBoundingClientRect().width - 0.42) < 0.05, "进度条长度对应音量");
    await act(async () => changeLevel({ kind: "volume", level: 0.42, muted: true }));
    check(popup()?.classList.contains("level-popup--muted") && popup()?.getAttribute("aria-label") === "已静音", "静音时显示静音");
    await act(async () => changeLevel({ kind: "brightness", level: 0.7 }));
    check(popup()?.classList.contains("level-popup--brightness") && popup()?.getAttribute("aria-label") === "亮度 70%", "调亮度时显示亮度");
    await act(async () => changeLevel(null));
    await settle();
    check(!popup(), "提示结束后恢复原来的文字");
    const device = () => document.querySelector<HTMLElement>(".device-alert");
    await act(async () => changeDeviceAlert({ kind: "audioConnected", name: "耳机 (WH-1000XM4 Wireless Noise Cancelling Stereo Headphones)", device: "headphones", battery: 80 }));
    await settle();
    const deviceText = device()?.querySelector<HTMLElement>(".device-alert__text");
    check(device()?.getAttribute("aria-label")?.endsWith("已连接, 电量 80%") === true && device()?.querySelector(".device-alert__battery")?.textContent === "80%"
      && document.querySelector(".island")!.getBoundingClientRect().width === islandWidth && deviceText!.scrollWidth > deviceText!.clientWidth,
      "耳机连接时显示名称和电量，名字太长时截断，不撑宽岛屿");
    await act(async () => { changeLevel({ kind: "volume", level: 0.3, muted: false }); });
    check(Boolean(device()) && !popup(), "设备提示和音量提示同时出现时先显示设备提示");
    await act(async () => { changeLevel(null); changeDeviceAlert({ kind: "powerConnected", battery: null }); });
    check(device()?.classList.contains("device-alert--charge") && device()?.getAttribute("aria-label") === "正在充电" && !device()?.querySelector(".device-alert__battery"),
      "插上电源时显示正在充电，没有电量就不显示百分比");
    await act(async () => changeDeviceAlert({ kind: "batteryLow", name: "AirPods", battery: 10 }));
    check(device()?.classList.contains("device-alert--warn") && device()?.getAttribute("aria-label") === "AirPods 电量低, 电量 10%", "蓝牙设备电量低时提醒");
    await act(async () => changeDeviceAlert(null));
    check(!device(), "设备提示结束后恢复原来的文字");
    await act(async () => { changeAgentsEnabled(true); changeAgentCount(0); changeWidth(280); });
    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
    console.error(error);
  } finally {
    window.matchMedia = matchMedia;
    restoreStorage();
  }
}

await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><Fixture /></StrictMode>); });
if (!automated) Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
for (const [label, action] of [
  ["微信消息", () => notify("wechat")], ["QQ 消息", () => notify("qq")], ["邮箱消息", () => notify("qqMail")],
  ["长 QQ 消息", () => notify("qq", true)], ["340px", () => update(async () => changeWidth(340))],
  ["像素主题", () => update(async () => changeFont(true))], ["系统主题", () => update(async () => changeFont(false))],
  ["280px", () => update(async () => changeWidth(280))], ["Agent 标题", () => update(async () => changeAgent({ provider: "claudeCode", label: "Claude Code", title: "设置界面完善思路" }))], ["清除 Agent", () => update(async () => changeAgent(null))], ["2 个会话", () => update(async () => changeAgentCount(2))], ["自动检查", () => { location.search = "?test=1"; }],
] as const) {
  const control = document.createElement("button");
  control.textContent = label;
  if (label === "自动检查") control.id = "run-checks";
  control.onclick = () => void action();
  document.getElementById("controls")!.append(control);
}
const params = new URLSearchParams(location.search);
if (params.has("test")) await runChecks();
else {
  results.textContent = "点击按钮查看真实收起态的消息动画；通知约 5 秒后自动恢复。";
  const state = params.get("state");
  if (state === "wechat" || state === "qq" || state === "qqMail") await notify(state);
}
