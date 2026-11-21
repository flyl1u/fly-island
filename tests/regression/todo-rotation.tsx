import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { IslandApp } from "../../src/windows/island/IslandApp";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { getLocalDateString } from "../../src/utils/date";
import { ACTIVE_TODOS_STORAGE_KEY, TODO_TIMERS_STORAGE_KEY } from "../../src/features/todos/storage";
import type { TodoTimer } from "../../src/features/todos/timer";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("fly-island-")));
const realNow = Date.now;
const realAudio = window.Audio;
let now = realNow();
let sounds = 0;
let revision = 0;
let version = 0;
Date.now = () => now;
Object.defineProperty(window, "Audio", { configurable: true, value: class {
  volume = 1;
  play() { sounds++; return Promise.resolve(); }
} });
for (const key of original.keys()) localStorage.removeItem(key);
localStorage.setItem(LOCALE_STORAGE_KEY, "en");
localStorage.setItem("fly-island-current-date", getLocalDateString());
const titles = ["First running task", "Review the release notes and prepare screenshots", "Third running task", "Never started"];
localStorage.setItem("fly-island-todos", JSON.stringify(titles.map((title, i) => ({ id: `t${i + 1}`, title, completed: false, createdAt: now }))));
localStorage.setItem("fly-island-settings", JSON.stringify({
  agentStatusEnabled: false, musicEnabled: false, shelfEnabled: false, autoTuck: false, autoCollapseSeconds: 0,
  carryOverIncompleteTodos: false, todoTimerEnabled: true, rotateTodos: true, todoRotationSeconds: 1, todoRotationCount: 1,
}));
const legacy: TodoTimer = { todoId: "t1", endsAt: now + 240_000, durationMinutes: 4, notified: false };
localStorage.setItem("fly-island-active-todo", "t1");
localStorage.setItem("fly-island-todo-timer", JSON.stringify(legacy));
mockIPC((command, payload) => {
  switch (command) {
    case "plugin:window|is_visible": return true;
    case "get_clipboard_history": return { settings: { enabled: false, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: false }, items: [] };
    case "get_file_shelf": return { items: [] };
    case "list_agent_sessions": case "agent_sessions_in_front": case "agent_approval_pending": case "get_qq_mail_state": return [];
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "" };
    case "get_media_state": return DEFAULT_MEDIA_STATE;
    case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
    case "set_island_interaction": return "disabled";
    case "get_island_top_attachment": return true;
    case "set_qq_notifications_enabled": case "get_qq_notification_state": return { revision: ++revision, enabled: false, status: "disabled", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: false, status: "disabled", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [] };
    case "set_translation_shortcut": return (payload as { shortcut: string }).shortcut;
    case "updater_configured": case "has_translation_secret": return false;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("main");
const root = createRoot(document.getElementById("root")!);
const checks: string[] = [];
const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); checks.push(`PASS ${message}`); };
const mount = () => act(async () => root.render(<StrictMode key={version++}><I18nProvider><IslandApp /></I18nProvider></StrictMode>));
const click = (selector: string) => act(async () => {
  const button = document.querySelector<HTMLElement>(selector);
  if (!button) throw new Error(`Missing ${selector}`);
  button.click();
});
const start = (id: string) => click(`.todo-list [data-todo-id="${id}"] .todo-start`);
const ids = (): string[] => JSON.parse(localStorage.getItem(ACTIVE_TODOS_STORAGE_KEY) ?? "[]");
const timers = (): TodoTimer[] => JSON.parse(localStorage.getItem(TODO_TIMERS_STORAGE_KEY) ?? "[]");
const expanded = () => Boolean(document.querySelector(".island--expanded"));
const current = () => document.querySelector<HTMLElement>(".todo-rotation[data-rotating-todo-id]");
const pill = () => current()?.querySelector(".todo-rotation__layer:last-child .island__timer-pill")?.textContent;
const settings = (patch: object) => act(async () => {
  localStorage.setItem("fly-island-settings", JSON.stringify({ ...JSON.parse(localStorage.getItem("fly-island-settings")!), ...patch }));
  window.dispatchEvent(new StorageEvent("storage", { key: "fly-island-settings" }));
});
const advance = (milliseconds: number) => act(async () => { now += milliseconds; document.dispatchEvent(new Event("visibilitychange")); });
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
const settle = async () => {
  const end = performance.now() + 5000;
  while (performance.now() < end && document.querySelector(".island")!.getAnimations().some(a => a.playState === "running")) await wait(30);
};
const startTimed = async (id: string, minutes: number) => {
  await settle();
  await click(`.todo-list [data-todo-id="${id}"] .todo-timer-button`);
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(".todo-duration-picker input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(minutes));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { document.querySelector(".todo-duration-picker input")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
  await act(async () => { document.querySelector<HTMLFormElement>(".todo-duration-picker")!.requestSubmit(); });
};
const waitForTask = async (id: string) => {
  const end = performance.now() + 5000;
  while (current()?.dataset.rotatingTodoId !== id && performance.now() < end) await wait(30);
  check(current()?.dataset.rotatingTodoId === id, `rotation reaches ${id}`);
};
try {
  await mount();
  check(ids().join() === "t1" && timers()[0]?.endsAt === legacy.endsAt && pill() === "04:00", "legacy active ID and timer migrate without resetting the deadline");
  await click(".island__open-button");
  await start("t2");
  await start("t3");
  check(expanded() && ids().join() === "t1,t2,t3", "Start keeps the island expanded and allows three simultaneous tasks despite the old count field");
  check(document.querySelectorAll(".todo-start--active").length === 3 && timers().length === 1, "every started row shows Stop; plain Start leaves existing timers alone");
  await start("t2");
  check(expanded() && ids().join() === "t1,t3" && timers()[0]?.endsAt === legacy.endsAt, "clicking Stop affects only that task");
  await startTimed("t2", 7);
  const secondEnd = timers().find(timer => timer.todoId === "t2")!.endsAt;
  await advance(10_000);
  await start("t3");
  await startTimed("t3", 1);
  check(expanded() && timers().length === 3 && timers().find(timer => timer.todoId === "t1")?.endsAt === legacy.endsAt
    && timers().find(timer => timer.todoId === "t2")?.endsAt === secondEnd, "three independent timers retain their own deadlines and never collapse the panel");
  await click(".island__collapse-target");
  await settle();
  const width = document.querySelector(".island")!.getBoundingClientRect().width;
  await waitForTask("t1");
  check(pill() === "03:50", "first task shows its own remaining time");
  await waitForTask("t2");
  check(pill() === "06:50", "second task shows its own remaining time");
  await waitForTask("t3");
  check(pill() === "01:00" && document.querySelector(".island")!.getBoundingClientRect().width === width, "third task shows its own timer without resizing the island");
  check(!document.querySelector('.todo-rotation[data-rotating-todo-id="t4"]'), "unstarted tasks never join rotation");
  await settings({ collapsedAutoWidth: false, collapsedWidth: 240, islandFontPercent: 120 });
  await settle();
  await waitForTask("t2");
  const narrow = current()!.getBoundingClientRect();
  const timerPill = current()!.querySelector<HTMLElement>(".todo-rotation__layer:last-child .island__timer-pill")!;
  check(timerPill.getBoundingClientRect().left >= narrow.left && timerPill.getBoundingClientRect().right <= narrow.right + 1
    && getComputedStyle(timerPill).flexShrink === "0", "long titles truncate while the timer pill fits a narrow island at 120% font size");
  await click(".island__open-button");
  const held = current()?.dataset.rotatingTodoId;
  await wait(1200);
  check(current()?.dataset.rotatingTodoId === held, "expanded panels pause switching");
  await click(".island__collapse-target");
  await click(".island__quiet-button");
  const tucked = current()?.dataset.rotatingTodoId;
  await wait(1200);
  check(document.querySelector(".island--tucked") && current()?.dataset.rotatingTodoId === tucked, "tucking pauses switching");
  await click(".island__open-button");
  await settings({ todoRotationMode: "scroll", todoScrollSpeed: 20 });
  await click(".island__collapse-target");
  const track = document.querySelector<HTMLElement>(".todo-rotation__track")!;
  check(track.children.length === 6 && [...track.children].slice(0, 3).map(node => (node as HTMLElement).dataset.rotatingTodoId).join() === "t1,t2,t3", "scroll contains all started tasks and one seamless duplicate");
  check(track.offsetHeight === 6 * 28 && [...track.children].every(node => (node as HTMLElement).offsetHeight === 28)
    && Math.abs(track.getBoundingClientRect().height - 6 * track.children[0].getBoundingClientRect().height) < 1,
    "scroll rows retain the exact single-line height and scale together for a seamless loop");
  check([...track.children].slice(0, 3).map(node => node.querySelector(".island__timer-pill")?.textContent).join() === "03:50,06:50,01:00", "each scrolling row carries its own timer pill");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  check(getComputedStyle(track).animationName === (reduced ? "none" : "todoContinuousScroll"), "scroll respects reduced motion");
  await click(".island__open-button");
  check(getComputedStyle(document.querySelector(".todo-rotation__track")!).animationPlayState === "paused", "expanded panels pause scrolling");
  await mount();
  check(ids().length === 3 && timers().length === 3 && timers().find(timer => timer.todoId === "t2")?.endsAt === secondEnd, "remount restores all started tasks and independent deadlines");
  await settings({ rotateTodos: false });
  check(ids().length === 3 && timers().length === 3 && !current(), "turning rotation off keeps every timer and stops switching the collapsed display");
  await settings({ rotateTodos: true });
  await advance(60_000);
  check(sounds === 1 && timers().find(timer => timer.todoId === "t3")?.notified && !timers().find(timer => timer.todoId === "t1")?.notified, "only the elapsed task expires and rings");
  await mount();
  check(sounds === 1 && timers().length === 3, "expired parallel rounds do not notify twice after restart");
  await click(".island__open-button");
  await click('.todo-list [data-todo-id="t3"] .todo-timer-actions button:last-child');
  check(expanded() && timers().find(timer => timer.todoId === "t3")?.endsAt === now + 60_000
    && timers().find(timer => timer.todoId === "t2")?.endsAt === secondEnd, "another round restarts only that task and leaves the panel expanded");
  await click('.todo-list [data-todo-id="t2"] .todo-check');
  check(!ids().includes("t2") && !timers().some(timer => timer.todoId === "t2"), "completion removes only that task from rotation and timers");
  await click('.todo-list [data-todo-id="t3"] .todo-delete');
  check(ids().join() === "t1" && timers().length === 1, "deleting a running task removes its own round");
  await start("t4");
  await settings({ rotateTodos: false });
  check(ids().join() === "t1" && timers().length === 1, "disabling rotation drops the extra task without a timer");
  await start("t4");
  check(!expanded() && ids().join() === "t4,t1" && timers().length === 1, "plain Start collapses the island and leaves an existing timer running");
  await click(".island__open-button");
  await start("t4");
  check(ids().join() === "t1" && timers().length === 1, "stopping the plain task returns to the task with a timer");
  await start("t1");
  await settings({ rotateTodos: true });
  await startTimed("t1", 2);
  await startTimed("t4", 3);
  await settings({ todoTimerEnabled: false });
  check(ids().length === 2 && timers().length === 0, "disabling the timer cancels all rounds and preserves started tasks");
  await settings({ todoTimerEnabled: true });
  check(timers().length === 0, "re-enabling the timer does not resurrect old rounds");
  await start("t1"); await start("t4");
  await startTimed("t1", 2); await startTimed("t4", 3);
  const previousDay = new Date(); previousDay.setDate(previousDay.getDate() - 1);
  localStorage.setItem("fly-island-current-date", getLocalDateString(previousDay));
  const beforeRollover = timers().map(timer => timer.endsAt).join();
  await mount();
  check(ids().join() === "t1,t4" && timers().map(timer => timer.endsAt).join() === beforeRollover
    && localStorage.getItem("fly-island-current-date") === getLocalDateString(), "midnight rollover preserves every running timed task and its ID");
  await advance(180_000);
  check(timers().every(timer => timer.notified) && sounds === 2, "simultaneous expiry persists every notification flag before one alert");
  await click('.todo-list [data-todo-id="t1"] .todo-timer-actions button:last-child');
  await click('.todo-list [data-todo-id="t4"] .todo-timer-actions button:last-child');
  await act(async () => {
    now += 120_000; document.dispatchEvent(new Event("visibilitychange"));
    now += 60_000; document.dispatchEvent(new Event("visibilitychange"));
  });
  check(timers().every(timer => timer.notified) && sounds === 4, "back-to-back expiry events merge both rounds without reverting notification flags");
  await mount();
  check(sounds === 4 && timers().every(timer => timer.notified), "merged expiration flags survive restart without duplicate alerts");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.documentElement.dataset.testResult = "failed";
  checks.push(`FAIL ${String(error)}`);
} finally {
  await act(async () => root.unmount());
  Date.now = realNow;
  Object.defineProperty(window, "Audio", { configurable: true, value: realAudio });
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("fly-island-"))) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
  document.getElementById("results")!.textContent = checks.join("\n");
}
