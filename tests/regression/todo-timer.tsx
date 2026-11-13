// The real island and todo hooks with fake wall time; no minutes-long waits or fake timer UI.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { IslandApp } from "../../src/windows/island/IslandApp";
import { getLocalDateString } from "../../src/utils/date";
import { TODO_DURATION_STORAGE_KEY, TODO_TIMER_STORAGE_KEY } from "../../src/features/todos/storage";
import type { TodoTimer } from "../../src/features/todos/timer";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
const realNow = Date.now;
const realAudio = window.Audio;
let now = realNow();
let sounds = 0;
let visible = true;
let showCalls = 0;
let version = 0;
let revision = 0;
Date.now = () => now;
Object.defineProperty(window, "Audio", { configurable: true, value: class {
  volume = 1;
  play() { sounds++; return Promise.resolve(); }
} });
window.addEventListener("beforeunload", () => {
  Date.now = realNow;
  Object.defineProperty(window, "Audio", { configurable: true, value: realAudio });
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("focusd-island-"))) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
});
for (const key of original.keys()) localStorage.removeItem(key);
localStorage.setItem(LOCALE_STORAGE_KEY, query.get("lang") === "en" ? "en" : "zh-CN");
localStorage.setItem("focusd-island-current-date", getLocalDateString());
localStorage.setItem("focusd-island-todos", JSON.stringify([
  { id: "t1", title: "核对录屏素材和脚本中的演示步骤", completed: false, createdAt: now },
  { id: "t2", title: "Review the release notes and prepare screenshots", completed: false, createdAt: now },
]));
localStorage.setItem("focusd-island-settings", JSON.stringify({
  agentStatusEnabled: false, musicEnabled: false, shelfEnabled: false,
  rotateTodos: true, todoRotationSeconds: 3, autoCollapseSeconds: 0,
  autoTuck: false, expandedScale: Number(query.get("scale") ?? 1),
  carryOverIncompleteTodos: false, todoTimerEnabled: true,
}));
localStorage.setItem("focusd-island-save-directory", "");

mockIPC((command, payload) => {
  switch (command) {
    case "show_ready_island": showCalls++; return null;
    case "plugin:window|is_visible": return visible;
    case "get_clipboard_history": return {
      settings: { enabled: false, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: false }, items: [],
    };
    case "get_file_shelf": return { items: [] };
    case "list_agent_sessions":
    case "agent_sessions_in_front":
    case "agent_approval_pending":
    case "get_qq_mail_state": return [];
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "" };
    case "get_media_state": return DEFAULT_MEDIA_STATE;
    case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
    case "set_island_interaction": return "disabled";
    case "get_island_top_attachment": return true;
    case "set_qq_notifications_enabled":
    case "get_qq_notification_state": return { revision: ++revision, enabled: false, status: "disabled", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: false, status: "disabled", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [] };
    case "set_translation_shortcut": return (payload as { shortcut: string }).shortcut;
    case "updater_configured":
    case "has_translation_secret": return false;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("main");

const root = createRoot(document.getElementById("root")!);
const results = document.getElementById("results")!;
const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const mount = () => act(async () => {
  root.render(<StrictMode key={version++}><I18nProvider><IslandApp /></I18nProvider></StrictMode>);
});
const click = (selector: string) => act(async () => {
  const button = document.querySelector<HTMLElement>(selector);
  if (!button) throw new Error(`Missing ${selector}`);
  button.click();
});
const open = () => click(".island__open-button");
const start = (id: string) => click(`[data-todo-id="${id}"] .todo-start`);
const choose = (id: string) => click(`[data-todo-id="${id}"] .todo-timer-button`);
const watchLabel = (id: string) => document.querySelector(`[data-todo-id="${id}"] .todo-timer-button`)?.getAttribute("aria-label");
const escape = () => act(async () => {
  document.querySelector(".todo-duration-picker")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
});
const stored = () => JSON.parse(localStorage.getItem(TODO_TIMER_STORAGE_KEY) ?? "null") as TodoTimer | null;
const collapsedTime = () => document.querySelector(".island__active-task")?.textContent;
const advance = (milliseconds: number) => act(async () => {
  now += milliseconds;
  document.dispatchEvent(new Event("visibilitychange"));
});
const typeMinutes = (value: string) => act(async () => {
  const input = document.querySelector<HTMLInputElement>(".todo-duration-picker input")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const pick = async (minutes: number) => {
  await typeMinutes(String(minutes));
  await act(async () => { document.querySelector(".todo-duration-picker input")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
};
const go = () => act(async () => {
  document.querySelector<HTMLFormElement>(".todo-duration-picker")!.requestSubmit();
});
const layoutSettled = async () => {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    const picker = document.querySelector<HTMLElement>(".todo-duration-picker");
    const island = document.querySelector<HTMLElement>(".island")!;
    if (picker && !island.getAnimations().some((animation) => animation.playState === "running")
      && picker.getBoundingClientRect().top >= island.getBoundingClientRect().top) return;
  }
  throw new Error("时长选择器布局未稳定或被岛屿裁切");
};

try {
  await mount();
  await open();
  check(document.querySelectorAll(".todo-drag-handle").length === 2, "Default settings expose both reorder handles");
  const settleDeadline = performance.now() + 5000;
  while (performance.now() < settleDeadline && document.querySelector(".island")!.getAnimations().some((a) => a.playState === "running")) {
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
  }
  const pointer = async (type: string, target: HTMLElement, x: number, y: number) => act(async () => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y }));
  });
  const handle = document.querySelector<HTMLElement>('[data-todo-id="t1"] .todo-drag-handle')!;
  // Synthetic pointers have no native active-pointer record; keep real hit testing and handlers.
  handle.setPointerCapture = () => {};
  const target = document.querySelector<HTMLElement>('[data-todo-id="t2"]')!.getBoundingClientRect();
  await pointer("pointerdown", handle, 0, 0);
  await pointer("pointermove", handle, target.x + 30, target.y + 10);
  await pointer("pointerup", handle, target.x + 30, target.y + 10);
  const order = () => [...document.querySelectorAll<HTMLElement>("[data-todo-id]")].map((node) => node.dataset.todoId).join();
  check(order() === "t2,t1" && JSON.parse(localStorage.getItem("focusd-island-todos")!)[0].id === "t2", "Dragging reorders DOM and persisted todos");
  check(!document.querySelector(".todo-title-input, .todo-duration-picker") && !localStorage.getItem("focusd-island-active-todo"), "Dragging never edits or starts a todo");
  await mount();
  await open();
  check(order() === "t2,t1", "Reordered todos survive remount");
  const settings = (patch: object) => act(async () => {
    localStorage.setItem("focusd-island-settings", JSON.stringify({ ...JSON.parse(localStorage.getItem("focusd-island-settings")!), ...patch }));
    window.dispatchEvent(new StorageEvent("storage", { key: "focusd-island-settings" }));
  });
  await settings({ enableTodoReorder: false, todoReorderVersion: 1, todoTimerEnabled: false });
  check(!document.querySelector(".todo-drag-handle"), "Storage sync hides handles when disabled");
  await start("t1");
  check(!stored() && !document.querySelector(".todo-duration-picker") && localStorage.getItem("focusd-island-active-todo") === "t1", "Disabled timer starts immediately without picker");
  await open();
  await start("t1");
  check(!localStorage.getItem("focusd-island-active-todo"), "Disabled timer stops immediately");
  await settings({ todoTimerEnabled: true, enableTodoReorder: true });
  await start("t1");
  check(stored()?.durationMinutes === 15, "开启番茄钟后点开始直接按默认 15 分钟倒计时");
  await settings({ todoTimerEnabled: false });
  check(!stored() && localStorage.getItem("focusd-island-active-todo") === "t1" && !document.querySelector(".todo-countdown"), "Disabling cancels timer and preserves active todo");
  await advance(900_000);
  check(sounds === 0 && !document.querySelector(".todo-timer-actions"), "Disabled deadline cannot notify");
  await settings({ todoTimerEnabled: true });
  check(!stored(), "Re-enabling never restores cancelled timer");
  await open();
  await start("t1");
  localStorage.removeItem(TODO_DURATION_STORAGE_KEY);
  await mount();
  await open();
  check(watchLabel("t1")?.includes("15") && document.querySelector('[data-todo-id="t1"] .todo-timer-button + .todo-start'),
    "开始按钮左边是怀表，首次默认 15 分钟");
  await choose("t1");
  const watchRect = document.querySelector('[data-todo-id="t1"] .todo-timer-button')!.getBoundingClientRect();
  check(document.querySelector<HTMLInputElement>(".todo-duration-picker input")?.value === "15" && !stored(), "点怀表打开小时间设置，默认 15 分钟，不直接开始");
  check(document.querySelector(".todo-duration-picker")!.getBoundingClientRect().bottom <= watchRect.top, "时间设置出现在怀表上方");
  await go();
  const firstEnd = stored()!.endsAt;
  check(stored()?.todoId === "t1" && firstEnd === now + 900_000, "选 15 分钟后保存当前待办和绝对结束时间");
  check(document.querySelector(".island--collapsed") && collapsedTime()?.includes("15:00"), "开始后收起，折叠岛显示倒计时并暂停待办轮播");
  check(document.querySelector(".island__active-task-title")?.textContent === "核对录屏素材和脚本中的演示步骤"
    && document.querySelector(".island__timer-pill")?.textContent === "15:00", "折叠岛显示任务标题，倒计时在小胶囊里");
  await advance(850_000);
  check(collapsedTime()?.includes("00:50"), "按真实结束时间计算剩余时间，恢复可见时立即校准");
  await mount();
  check(stored()?.endsAt === firstEnd && collapsedTime()?.includes("00:50"), "重启恢复同一轮剩余 50 秒");
  await advance(50_000);
  check(document.querySelector(".island--expanded") && document.querySelector(".todo-timer-actions"), "折叠态到时弹出待办，显示时间到和完成 / 再来一轮");
  check(sounds === 1 && stored()?.notified, "一轮只响一次，通知标记持久化");
  await advance(10_000);
  await mount();
  check(sounds === 1 && collapsedTime()?.includes("时间到"), "不操作、StrictMode 重挂载和重启都不会重复响");
  await open();
  await click(".todo-timer-actions button:last-child");
  check(stored()?.durationMinutes === 15 && stored()?.endsAt === now + 900_000 && !stored()?.notified, "再来一轮按原时长重新计时");
  const showBeforeHiddenExpiry = showCalls;
  visible = false;
  await advance(900_000);
  check(sounds === 2 && document.querySelector(".island--collapsed") && showCalls === showBeforeHiddenExpiry, "托盘隐藏到时只响一次，不调用显示窗口或展开");
  visible = true;
  await open();
  await click(".todo-timer-actions button:first-of-type");
  check(stored() === null && localStorage.getItem("focusd-island-active-todo") === null, "完成清除倒计时及进行中状态");

  check(watchLabel("t2")?.includes("15"), "怀表记住上次的 15 分钟");
  await choose("t2");
  check(document.querySelector<HTMLInputElement>(".todo-duration-picker input")?.value === "15", "时间设置显示上次的 15 分钟");
  check(!document.querySelector("input[type=number]"), "Custom duration has no native spin buttons");
  await click(".number-stepper__button:last-child");
  check(document.querySelector<HTMLInputElement>(".number-stepper input")?.value === "20", "Custom duration steps by five");
  await typeMinutes("999");
  await act(async () => { const input = document.querySelector<HTMLInputElement>(".number-stepper input")!; input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  check(document.querySelector<HTMLInputElement>(".number-stepper input")?.value === "240"
    && document.querySelector<HTMLButtonElement>(".number-stepper__button:last-child")?.disabled, "Custom duration clamps and disables Plus at 240");
  await typeMinutes("7");
  await act(async () => { const input = document.querySelector<HTMLInputElement>(".number-stepper input")!; input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  await go();
  check(stored()?.durationMinutes === 7 && collapsedTime()?.includes("07:00"), "自定义 7 分钟开始并显示 07:00");
  await open();
  await start("t2");
  check(stored() === null && watchLabel("t2")?.includes("7 分钟"), "结束立即取消当前倒计时，怀表记住 7 分钟");
  await start("t2");
  check(stored()?.durationMinutes === 7 && collapsedTime()?.includes("07:00"), "一键开始直接沿用上次的 7 分钟");
  await open();
  await start("t2");
  await choose("t2");
  check(document.querySelector<HTMLInputElement>(".todo-duration-picker input")?.value === "7", "记住自定义时长，重新打开仍为 7 分钟");
  await click(".todo-duration-picker .number-stepper__button:last-child");
  await escape();
  check(!document.querySelector(".todo-duration-picker") && !stored() && watchLabel("t2")?.includes("12 分钟"), "Esc 关闭设置，不开始但记住改后的 12 分钟");
  await start("t2");
  check(stored()?.durationMinutes === 12, "关闭设置后点开始用改后的 12 分钟");
  await open();
  await start("t2");
  await choose("t2");
  await pick(25);
  await go();
  await click(".island__quiet-button");
  check(document.querySelector(".island--tucked"), "倒计时期间可贴边收起");
  await advance(1_500_000);
  check(document.querySelector(".island--expanded") && !document.querySelector(".island--tucked") && sounds === 3, "贴边收起到时露出并展开，播放一次提示音");
  await click(".todo-timer-actions button:last-child");
  await open();
  await advance(1_500_000);
  check(document.querySelector(".island--expanded") && document.querySelector(".todo-timer-actions") && sounds === 4, "已展开时到时显示操作并只响一次");

  await start("t2");
  await choose("t2");
  await pick(60);
  await go();
  await open();
  await click('[data-todo-id="t1"] .todo-check');
  await choose("t1");
  await escape();
  check(stored()?.todoId === "t2" && stored()?.durationMinutes === 60, "关闭另一项的时间设置保留当前倒计时");
  await choose("t1");
  await pick(90);
  await go();
  await advance(3_600_000);
  check(stored()?.todoId === "t1" && !stored()?.notified && localStorage.getItem("focusd-island-active-todo") === "t1" && sounds === 4,
    "开始另一项取消旧轮，旧截止时间不再提醒");
  await open();
  await start("t1");
  await choose("t2");
  await pick(60);
  await go();
  await open();
  await click('[data-todo-id="t2"] .todo-delete');
  await advance(3_600_000);
  check(stored() === null && sounds === 4, "删除正在计时的待办取消本轮，不再到时提醒");
  await choose("t1");
  await pick(15);
  await go();
  await open();
  await click('[data-todo-id="t1"] .todo-check');
  await advance(900_000);
  check(stored() === null && sounds === 4, "提前完成取消本轮，不会在原截止时间响铃");

  // Restore an unannounced deadline missed while the app was closed.
  const todo = { id: "restored", title: "重启后继续核对发布说明", completed: false, createdAt: now };
  localStorage.setItem("focusd-island-todos", JSON.stringify([todo]));
  localStorage.setItem("focusd-island-active-todo", todo.id);
  // A previous day's pending round must survive the normal archive/rollover on startup.
  const previousDay = new Date();
  previousDay.setDate(previousDay.getDate() - 1);
  localStorage.setItem("focusd-island-current-date", getLocalDateString(previousDay));
  localStorage.setItem(TODO_TIMER_STORAGE_KEY, JSON.stringify({ todoId: todo.id, endsAt: now - 1, durationMinutes: 1, notified: false }));
  await mount();
  check(document.querySelector(".todo-timer-actions") && stored()?.notified && sounds === 5, "关闭期间已过期的倒计时恢复为时间到，补一次提醒");
  check(localStorage.getItem("focusd-island-current-date") === getLocalDateString() && stored()?.todoId === todo.id,
    "启动跨日归档保留计时任务及其标识，时间到不会被归档流程清掉");
  await mount();
  check(sounds === 5, "离线过期的提醒重启后也不重复");
  await open();
  await click(".todo-timer-actions button:first-of-type");

  // English and both scale limits use the real constrained island, not a free-growing fixture.
  localStorage.setItem(LOCALE_STORAGE_KEY, "en");
  localStorage.setItem("focusd-island-todos", JSON.stringify([{ ...todo, completed: false }]));
  localStorage.setItem(TODO_DURATION_STORAGE_KEY, "240");
  await mount();
  await open();
  await choose(todo.id);
  await layoutSettled();
  const picker = document.querySelector<HTMLElement>(".todo-duration-picker")!;
  const island = document.querySelector<HTMLElement>(".island")!;
  const pickerRect = picker.getBoundingClientRect();
  const islandRect = island.getBoundingClientRect();
  check(picker.textContent?.includes("min") && picker.querySelector("input")?.value === "240", "英文时长文案与记住的 240 分钟完整显示");
  check(picker.scrollWidth <= picker.clientWidth + 1 && pickerRect.left >= islandRect.left && pickerRect.right <= islandRect.right, "小时间设置在岛内，没有横向溢出");
  check(pickerRect.top >= islandRect.top && pickerRect.bottom <= islandRect.bottom, "只有一行待办时时间设置也在岛内，没有被裁切");

  if (query.get("view") === "running" || query.get("view") === "expired") {
    await go();
    if (query.get("view") === "expired") await advance(240 * 60_000);
  }
  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
