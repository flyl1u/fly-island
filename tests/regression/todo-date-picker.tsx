import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { IslandApp } from "../../src/windows/island/IslandApp";
import { DEFAULT_MEDIA_STATE } from "../../src/features/media/mediaState";
import { getLocalDateString } from "../../src/utils/date";
import { addDays } from "../../src/features/todos/schedule";
import { isIslandPickerOpen } from "../../src/lib/islandPicker";

const query = new URLSearchParams(location.search);
const manual = query.has("manual");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: !manual });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
const restore = () => {
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("focusd-island-"))) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
};
window.addEventListener("beforeunload", restore);
for (const key of original.keys()) localStorage.removeItem(key);
const today = getLocalDateString();
localStorage.setItem(LOCALE_STORAGE_KEY, query.get("lang") === "en" ? "en" : "zh-CN");
localStorage.setItem("focusd-island-current-date", today);
localStorage.setItem("focusd-island-last-page", "todo");
localStorage.setItem("focusd-island-todos", JSON.stringify([{ id: "t1", title: "整理录屏素材", completed: false, createdAt: Date.now() }]));
const settings = { agentStatusEnabled: false, musicEnabled: false, shelfEnabled: false, autoTuck: false,
  autoCollapseSeconds: 1, expandTrigger: "hover", carryOverIncompleteTodos: false,
  colorScheme: query.get("theme") === "light" ? "light" : "dark", expandedScale: Number(query.get("scale") ?? 1), islandFontPercent: 120 };
localStorage.setItem("focusd-island-settings", JSON.stringify(settings));
const calls: string[] = [];
let revision = 0;
mockIPC((command, payload) => {
  calls.push(command);
  switch (command) {
    case "get_clipboard_history": return { settings: { enabled: false, captureImages: true, maxItems: 100, shortcut: "Ctrl+Shift+V", shortcutEnabled: false }, items: [] };
    case "get_file_shelf": return { items: [] };
    case "get_agent_sessions": case "agent_approval_pending": case "get_qq_mail_state": return [];
    case "get_agent_status": return { codex: { phase: "idle", updatedAt: 0 }, claudeCode: { phase: "idle", updatedAt: 0 }, updatedAt: 0, statusPath: "" };
    case "get_media_state": return DEFAULT_MEDIA_STATE;
    case "get_foreground_fullscreen": return { active: false, onIslandMonitor: false };
    case "set_island_interaction": return "disabled";
    case "get_island_top_attachment": return true;
    case "take_island_hover_focus": case "release_island_hover_focus": return true;
    case "set_qq_notifications_enabled": return { revision: ++revision, enabled: false, status: "disabled", items: [], error: null };
    case "set_wechat_reminders_enabled": return { revision: ++revision, enabled: false, status: "disabled", pending: false, lastAttentionAt: null, error: null, previewEnabled: false, previewStatus: "off", hideMinimizedTaskbar: false, messages: [] };
    case "set_translation_shortcut": return (payload as { shortcut: string }).shortcut;
    case "updater_configured": case "has_translation_secret": return false;
    default: return null;
  }
}, { shouldMockEvents: true });
mockWindows("main");
const root = createRoot(document.getElementById("root")!);
const update = async (action: () => void | Promise<void>) => { if (manual) await action(); else await act(action); };
const click = async (selector: string) => update(() => {
  const button = document.querySelector<HTMLElement>(selector);
  if (!button) throw new Error(`Missing ${selector}`);
  button.click();
});
const checks: string[] = [];
const check = (value: unknown, text: string) => { if (!value) throw new Error(text); checks.push(`PASS ${text}`); };
const picker = () => document.querySelector<HTMLElement>(".todo-date-popover");
const height = () => Number.parseFloat(document.querySelector<HTMLElement>(".stage")!.style.getPropertyValue("--expanded-island-height"));
const hover = (inside: boolean) => update(async () => { await emit("island-hover-changed", inside); });
async function settle() {
  const deadline = performance.now() + 5000;
  while (document.querySelector(".island")!.getAnimations().some(a => a.playState === "running") && performance.now() < deadline) {
    await update(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
  }
}
async function fits() {
  await settle();
  const popup = picker()!.getBoundingClientRect();
  const notebook = document.querySelector(".todo-notebook")!.getBoundingClientRect();
  check(popup.left >= notebook.left && popup.right <= notebook.right && popup.bottom <= notebook.bottom,
    "the whole calendar stays inside the expanded panel");
}
try {
  await update(() => { root.render(<StrictMode><I18nProvider><IslandApp /></I18nProvider></StrictMode>); });
  await click(".island__open-button");
  await settle();
  if (manual) {
    await click(".todo-date-picker__button");
  } else {
    const baseHeight = height();
    await hover(true);
    await click(".todo-date-picker__button");
    check(picker() && !document.querySelector("input[type=date]") && isIslandPickerOpen(), "date picking uses an in-panel React calendar");
    check(document.activeElement?.getAttribute("data-date") === today, "opening focuses the selected day");
    check(picker()!.querySelector("[aria-current=date]") && picker()!.querySelector("[aria-pressed=true]"), "today and selected date have distinct states");
    check(height() > baseHeight, "a short panel grows temporarily for the calendar");
    await fits();
    const releaseCount = calls.filter(command => command === "release_island_hover_focus").length;
    await hover(false);
    await update(async () => { await emit("tauri://blur"); });
    await update(async () => { await new Promise(resolve => setTimeout(resolve, 1200)); });
    check(picker() && document.querySelector(".island--expanded") && calls.filter(command => command === "release_island_hover_focus").length === releaseCount,
      "hover out, native blur, idle timeout and focus return stay suppressed while picking");
    await update(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    check(document.activeElement?.getAttribute("data-date") === addDays(today, 1), "right arrow moves focus to tomorrow");
    await click(`[data-date="${addDays(today, 1)}"]`);
    check(!picker() && !isIslandPickerOpen() && document.querySelector(".todo-date-picker__button--later"), "choosing a future date closes and releases the picker");
    check(height() === baseHeight, "closing restores the original panel height");
    await hover(true);
    await click(".todo-date-picker__button");
    check(picker()!.querySelector(`[data-date="${addDays(today, 1)}"][aria-pressed=true]`), "reopening highlights the chosen date");
    await update(() => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    check(!picker() && document.querySelector(".island--expanded") && document.activeElement === document.querySelector(".todo-date-picker__button"), "Escape closes only the calendar and restores trigger focus");
    await click(".todo-date-picker__button");
    await click(".todo-date-popover__footer button:last-child");
    check(!document.querySelector(".todo-date-picker__button--later"), "clear removes the scheduled date");
    await click(".todo-date-picker__button");
    const title = picker()!.querySelector(".todo-date-popover__nav span")!.textContent;
    await click(".todo-date-popover__nav button:last-child");
    check(picker()!.querySelector(".todo-date-popover__nav span")!.textContent !== title, "next month changes the calendar");
    await click(".todo-date-popover__nav button:first-child");
    check(picker()!.querySelector(".todo-date-popover__nav span")!.textContent === title, "previous month restores the calendar");
    for (let i = 0; i < 12 && picker()!.querySelectorAll("[data-date]").length !== 42; i++) await click(".todo-date-popover__nav button:last-child");
    check(picker()!.querySelectorAll("[data-date]").length === 42, "a six-week month renders all dates");
    await fits();
    await update(() => {
      const target = document.querySelector(".todo-notebook__topline")!;
      target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    check(!picker() && !isIslandPickerOpen(), "clicking outside closes the calendar");
    await hover(false);
    await update(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    check(document.querySelector(".island--collapsed"), "hover-out collapse resumes after the calendar closes");
    await update(() => root.unmount());
    document.documentElement.dataset.testResult = "passed";
  }
} catch (error) {
  checks.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
}
document.getElementById("results")!.textContent = checks.join("\n");
