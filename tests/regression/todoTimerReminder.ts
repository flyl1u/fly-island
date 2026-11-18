import { act } from "react";
import { emit } from "@tauri-apps/api/event";
import type { TodoTimer } from "../../src/features/todos/timer";
import { TODO_TIMER_STORAGE_KEY } from "../../src/features/todos/storage";

type Actions = {
  mount: () => Promise<void>; open: () => Promise<void>; choose: (id: string) => Promise<void>;
  pick: (minutes: number) => Promise<void>; go: () => Promise<void>; advance: (ms: number) => Promise<void>;
  click: (selector: string) => Promise<void>; sounds: () => number;
};

/** Exercises reminder options and one-shot deadlines through the real notebook and island. */
export async function checkTodoReminders(actions: Actions, check: (condition: unknown, label: string) => void) {
  const { mount, open, choose, pick, go, advance, click, sounds } = actions;
  const stored = () => JSON.parse(localStorage.getItem(TODO_TIMER_STORAGE_KEY) ?? "null") as TodoTimer | null;
  const configure = async (patch: Record<string, unknown>) => act(async () => {
    localStorage.setItem("focusd-island-settings", JSON.stringify({ ...JSON.parse(localStorage.getItem("focusd-island-settings")!), ...patch }));
    window.dispatchEvent(new StorageEvent("storage", { key: "focusd-island-settings" }));
  });
  localStorage.setItem("focusd-island-todos", JSON.stringify([
    { id: "reminder", title: "核对发布说明和录屏中的每一步", completed: false, createdAt: Date.now() },
    { id: "second", title: "Prepare the English release notes", completed: false, createdAt: Date.now() },
  ]));
  localStorage.removeItem("focusd-island-active-todos"); localStorage.removeItem("focusd-island-active-todo");
  localStorage.removeItem("focusd-island-todo-timers"); localStorage.removeItem(TODO_TIMER_STORAGE_KEY);
  await configure({ todoTimerEnabled: true, todoTimerReminder: true, todoTimerReminderSound: false, rotateTodos: false });
  await mount(); await open(); await choose("reminder"); await pick(10);
  const picker = document.querySelector<HTMLElement>(".todo-duration-picker")!;
  const island = document.querySelector<HTMLElement>(".island")!;
  check(picker.querySelectorAll("input").length === 2, "开启提前提醒后，计时设置出现独立提醒分钟数");
  check(picker.getBoundingClientRect().left >= island.getBoundingClientRect().left
    && picker.getBoundingClientRect().right <= island.getBoundingClientRect().right && picker.scrollWidth <= picker.clientWidth + 1,
    "英文提醒时长设置在岛内且无横向溢出");
  const before = sounds();
  await go();
  check(stored()?.remindMinutes === 5 && stored()?.reminded === false, "本轮计时保存 5 分钟提醒阈值");
  await advance(5 * 60_000 - 1);
  check(!stored()?.reminded && !document.querySelector(".todo-reminder-popup"), "提醒阈值之前不弹出");
  await advance(1);
  check(stored()?.reminded && document.querySelector(".todo-reminder-popup") && sounds() === before,
    "到达阈值收起岛弹出提醒，声音默认关闭");
  await open();
  check(document.querySelector('[data-todo-id="reminder"].todo-item--ending .todo-countdown--warning'), "展开后对应待办文字闪烁，时间变红");
  await mount();
  check(stored()?.reminded && !document.querySelector(".todo-reminder-popup") && sounds() === before, "重启保留已提醒标记，不重复弹出或响铃");
  // The popup takes the bar's place while it shows; without it the bar shows the red countdown.
  check(document.querySelector(".island__active-task--ending .todo-countdown--warning"), "收起条显示结束前的红色倒计时");
  await configure({ todoTimerReminder: false });
  check(stored() && stored()?.remindMinutes === undefined && !document.querySelector(".island__active-task--ending"), "关闭提前提醒清除本轮提醒，保留倒计时");
  await configure({ todoTimerReminder: true, todoTimerReminderSound: true });
  // A running todo shows only its stop button; stop it before picking the next round.
  await open(); await click('[data-todo-id="reminder"] .todo-start'); await choose("reminder"); await pick(10); await go();
  await advance(5 * 60_000);
  check(document.querySelector(".todo-reminder-popup") && sounds() === before + 1, "单独打开声音后提前提醒只响一次");
  await advance(1_000);
  check(sounds() === before + 1, "后续轮询不会重复提前提醒音");
  // A running todo shows only its stop button; stop it before picking the next round.
  await open(); await click('[data-todo-id="reminder"] .todo-start'); await choose("reminder"); await pick(10); await go();
  await act(async () => emit("foreground-fullscreen-changed", { active: true, onIslandMonitor: true }));
  await advance(5 * 60_000);
  check(stored()?.reminded && !document.querySelector(".todo-reminder-popup") && sounds() === before + 1, "游戏 quiet 时记住已提醒，但不弹出、不播放提前提醒音");
  await act(async () => emit("foreground-fullscreen-changed", { active: false, onIslandMonitor: false }));
  check(!document.querySelector(".todo-reminder-popup"), "退出游戏不补弹旧提醒");
  await open(); await click('[data-todo-id="reminder"] .todo-start');
  check(stored() === null && !document.querySelector(".todo-item--ending"), "停止计时清除提醒及警示样式");
  await configure({ rotateTodos: true, todoTimerReminderSound: false });
  for (const id of ["reminder", "second"]) { await choose(id); await pick(10); await go(); }
  await advance(5 * 60_000);
  check(document.querySelectorAll(".todo-item--ending").length === 2, "多项独立计时同时到提醒点，各自进入警示状态");
  await click(".island__quiet-button");
  check(document.querySelector(".todo-rotation__row.island__active-task--ending .todo-countdown--warning"), "待办轮换的计时胶囊也显示红色提醒状态");
}
