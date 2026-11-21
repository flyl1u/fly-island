// pnpm dev, then open /tests/regression/plugin-panel.html?features=enabled. A plugin's own page:
// headline and note, a row per entry with its percentage and bar (amber at the threshold), the
// plugin's action buttons, a countdown the host ticks, the states before the first publish and
// while the process failed, and the way into the plugin's settings.
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { PluginPanel } from "../../src/features/plugins/PluginPanel";
import { PLUGINS_ENABLED } from "../../src/features/releaseFlags.ts";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
const t = TRANSLATIONS["zh-CN"];
const text = t.pluginPanel;

const manifest = {
  id: "activity-progress",
  name: { "zh-CN": "任务进度", en: "Task progress" },
  description: { "zh-CN": "在岛上查看任务完成进度", en: "Shows task completion progress" },
  version: "0.1.0",
  apiVersion: 1 as const,
  runtime: { command: "activity-progress.exe" },
  permissions: ["panel"],
  contributes: ["panel"],
  panel: { icon: "gauge" as const },
  settings: [],
  actions: [
    { id: "refresh", label: { "zh-CN": "刷新进度", en: "Refresh progress" } },
    { id: "rest_now", label: { "zh-CN": "现在休息", en: "Take a break now" } },
  ],
};
const progress = {
  headline: "2 项任务",
  note: "完成进度不高于 20% 时标出",
  rows: [
    { id: "reading", title: "阅读计划", detail: "按计划进行", percent: 59, countdownTo: null, tone: "normal" },
    { id: "organizing", title: "每日整理", detail: "进度落后", percent: 12, countdownTo: null, tone: "warning" },
  ],
  actions: ["refresh"],
  attention: true,
};
const withCountdown = {
  headline: "专注中",
  note: "坐满 45 分钟提醒你起来活动",
  rows: [{ id: "next", title: "下次休息", detail: "已坐 1 分钟", percent: null, countdownTo: Date.now() + 65_000, tone: "normal" }],
  actions: ["rest_now"],
  attention: false,
};
let panel: typeof progress | typeof withCountdown | null = progress;
let status = "running";
let reads = 0;
const actions: { id: string; action: string }[] = [];
mockIPC((command, payload) => {
  if (command === "get_plugins") {
    reads += 1;
    return {
      registry: { developerMode: false, indexUrl: "", installed: { "activity-progress": { manifest, enabled: true, directory: "", development: false, settings: {} } } },
      live: { "activity-progress": { status, quota: [], sessions: [], notifications: [], panel } },
    };
  }
  if (command === "run_plugin_action") { actions.push(payload as { id: string; action: string }); return { success: true }; }
  if (command === "plugin:event|listen") return 1;
  if (command === "plugin:event|unlisten") return null;
  return null;
}, { shouldMockEvents: true });

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = (ms = 80) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const fixture = document.getElementById("fixture")!;
const results = document.getElementById("results")!;
let root: Root = createRoot(fixture);
async function render() {
  await act(async () => root.render(<StrictMode><I18nProvider><PluginPanel pluginId="activity-progress" /></I18nProvider></StrictMode>));
  await wait(120);
}
const remount = async () => { await act(async () => root.unmount()); root = createRoot(fixture); };
const row = (index: number) => document.querySelectorAll<HTMLElement>(".plugin-panel__row")[index];
const value = (index: number) => row(index).querySelector<HTMLElement>(".plugin-panel__value")?.textContent;
const seconds = (clock: string) => clock.split(":").reduce((total, part) => total * 60 + Number(part), 0);

try {
  if (!PLUGINS_ENABLED) throw new Error("open this page with ?features=enabled");
  await render();
  check(document.querySelector(".plugin-panel__headline")?.textContent === "2 项任务", "页面顶部是插件给的一句话状态");
  check(document.querySelector(".plugin-panel__note")?.textContent === "完成进度不高于 20% 时标出", "下面一行说明这个页面在看什么");
  check(document.querySelectorAll(".plugin-panel__row").length === 2, "每项任务一行");
  check(value(0) === "59%" && value(1) === "12%", "行右侧是完成百分比");
  check(row(1).classList.contains("plugin-panel__row--warning") && getComputedStyle(row(1).querySelector(".plugin-panel__value")!).color === "rgb(255, 209, 102)",
    "低于阈值的行用暖色标出");
  check(row(0).querySelector<HTMLElement>(".plugin-panel__meter span")!.style.width === "59%", "进度条按百分比填充");
  const list = document.querySelector<HTMLElement>(".plugin-panel__rows")!;
  check(list.scrollHeight <= list.clientHeight + 1, "行数算出的页面高度刚好放得下，不出现滚动");
  const action = document.querySelector<HTMLButtonElement>(".plugin-panel__action")!;
  check(action.textContent === "刷新进度" && !action.disabled, "动作按钮用插件的动作名");
  const before = reads;
  await act(async () => action.click()); await wait();
  const last = actions[actions.length - 1];
  check(last?.id === "activity-progress" && last?.action === "refresh", "点按钮会运行插件声明的动作");
  check(reads > before, "动作之后重新读取快照");

  const longText = "Receiver diagnostics: " + "status-".repeat(120);
  panel = { ...progress, note: longText, rows: [{ ...progress.rows[0], detail: longText }] };
  fixture.style.width = "260px";
  await remount();
  await render();
  const longPanel = document.querySelector<HTMLElement>(".plugin-panel")!;
  check(longPanel.scrollWidth <= longPanel.clientWidth + 1, "长诊断在窄窗口内换行，不横向溢出");
  check(longPanel.scrollHeight > longPanel.clientHeight && getComputedStyle(longPanel).overflowY === "auto", "长说明超出页面时可滚动读取");
  check(document.querySelector<HTMLElement>(".plugin-panel__rows")!.clientHeight >= 58, "长说明不会挤没诊断区域");
  fixture.style.removeProperty("width");

  panel = withCountdown;
  await remount();
  await render();
  const first = document.querySelector<HTMLElement>(".plugin-panel__value--countdown")!.textContent!;
  check(/^\d+:\d{2}$/.test(first) && seconds(first) > 0, `倒计时由岛屿自己走（${first}）`);
  await wait(1200);
  const second = document.querySelector<HTMLElement>(".plugin-panel__value--countdown")!.textContent!;
  check(seconds(second) < seconds(first), `一秒后倒计时少了一秒（${first} → ${second}）`);
  check(document.querySelector<HTMLButtonElement>(".plugin-panel__action")!.textContent === "现在休息", "动作随这份面板变化");

  panel = null;
  await remount();
  await render();
  check(document.querySelector(".plugin-panel__empty")?.textContent === text.waiting, "插件还没上报时页面说明在等");
  check(document.querySelectorAll(".plugin-panel__action").length === 0, "没有面板就没有动作");

  status = "failed";
  await remount();
  await render();
  check(document.querySelector(".plugin-panel__empty")?.textContent === t.settings.plugins.status.failed, "进程启动失败时显示插件状态");

  root.unmount();
  results.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  results.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
