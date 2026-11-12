// pnpm dev, then open /tests/regression/todo-history-calendar.html. The todo page's history
// (earlier days by date, newest first; an unfinished todo goes back to today) and its calendar
// (month grid with today marked and dots on days with todos; a later day takes scheduled todos),
// driven through the real useTodos hook on seeded localStorage.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { TodoNotebook } from "../../src/features/todos/TodoNotebook";
import { useTodos } from "../../src/features/todos/useTodos";
import { addDays } from "../../src/features/todos/schedule";
import { getLocalDateString } from "../../src/utils/date";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
mockIPC(() => null);

// The page writes the island's own keys; whatever the browser profile had comes back on leaving.
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
window.addEventListener("beforeunload", () => {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("focusd-island-"))) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
});
for (const key of original.keys()) localStorage.removeItem(key);

const today = getLocalDateString();
const yesterday = addDays(today, -1);
const older = addDays(today, -3);
const later = addDays(today, 3);
const item = (id: string, title: string, completed = false) => ({ id, title, completed, createdAt: 0 });
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
localStorage.setItem("focusd-island-current-date", today);
localStorage.setItem("focusd-island-save-directory", "");
localStorage.setItem("focusd-island-todos", JSON.stringify([item("t1", "今天的事")]));
localStorage.setItem("focusd-island-scheduled-todos", JSON.stringify([{ id: "s1", title: "三天后交材料", date: later, createdAt: 0 }]));
const archives = [
  { date: yesterday, todos: [item("y1", "写周报"), item("y2", "回邮件", true)], dailyNote: "", savedAt: 0, savedToDisk: false },
  { date: older, todos: [item("o1", "整理桌面", true)], dailyNote: "旧笔记", savedAt: 0, savedToDisk: true, filePath: "D:\\Notes\\x.md" },
];
localStorage.setItem("focusd-island-archives", JSON.stringify(archives));

function Harness() {
  const { notebookProps } = useTodos({ carryOverIncompleteTodos: false, onStartTodo: () => {}, onMissingSaveDirectory: () => {} });
  return <TodoNotebook {...notebookProps} enableTodoReorder={false} scrollStartRows={6} />;
}

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const results = document.getElementById("results")!;
const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const click = (element: HTMLElement | null) => act(async () => { element!.click(); });
const type = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const fits = () => {
  const notebook = $(".todo-notebook")!;
  return notebook.scrollHeight <= notebook.clientHeight + 1;
};
const todayTitles = () => $$(".todo-list .todo-title").map((element) => element.textContent);

try {
  await act(async () => {
    createRoot(document.getElementById("fixture")!).render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>);
  });

  const toggles = $$(".todo-notebook__title-group .todo-page-toggle").map((element) => element.getAttribute("aria-label"));
  check(toggles.indexOf("查看以前的待办") === toggles.indexOf("打开今日笔记") + 1, `历史按钮紧挨在笔记按钮右边（${toggles.join(" / ")}）`);
  check(toggles.includes("打开日历"), "待办页有日历按钮");

  // History.
  await click(button("查看以前的待办"));
  const dates = $$(".todo-history__date > span:first-child").map((element) => element.textContent);
  check(dates.length === 2 && $(".todo-notebook__tab")?.textContent === "历史", `历史页按日期分组，共 ${dates.length} 天（${dates.join("、")}）`);
  const groups = $$(".todo-history .scheduled-list__group");
  check(groups[0].textContent!.includes("写周报") && groups[1].textContent!.includes("整理桌面"), "最近的一天排在最前");
  check(groups[0].textContent!.includes("完成 1/2"), "每天显示完成数");
  const done = $$(".todo-history__item--done").map((element) => element.textContent);
  check(done.includes("回邮件") && done.includes("整理桌面") && !done.includes("写周报"), "完成项和未完成项分得清");
  check(fits(), "历史页在固定高度内滚动，不撑出页面");

  await click(button("把“写周报”加到今天"));
  check(button("已在今天的列表里")?.disabled === true, "加回今天后按钮变成已加入，不会重复添加");

  await click(button("回到待办"));
  check($(".todo-notebook__tab")?.textContent === "待办" && todayTitles().includes("写周报") && todayTitles().includes("今天的事"),
    `点亮着的历史按钮回到今天的列表，"写周报"已在列表里（${todayTitles().join("、")}）`);

  // Calendar.
  await click(button("打开日历"));
  check($(".todo-calendar") !== null && $(".todo-notebook__tab")?.textContent === "日历", "打开日历页");
  const day = (date: string) => $<HTMLButtonElement>(`.todo-calendar__day[data-date="${date}"]`);
  check(day(today)?.classList.contains("todo-calendar__day--today") && day(today)?.getAttribute("aria-current") === "date", "今天有醒目的标记");
  check($$(".todo-calendar__day").length === 42, "月历固定六周");
  check(day(yesterday)?.querySelector(".todo-calendar__dot--open") && day(older)?.querySelector(".todo-calendar__dot--done"),
    "以前有待办的日子带圆点，全部完成的是灰点");
  check(fits(), "日历页放得进岛里");
  check($(".todo-calendar__day-panel")!.textContent!.includes("写周报"), "默认选中今天，右边列出今天的待办");

  if (!day(later)) await click(button("下个月"));
  check(day(later)?.querySelector(".todo-calendar__dot--scheduled"), "已安排的日子带紫点");
  await click(day(later));
  check($(".todo-calendar__item--scheduled")?.textContent === "三天后交材料", "点以后的日子看到当天已安排的待办");
  const input = $<HTMLInputElement>(".todo-calendar__input")!;
  await type(input, "带上合同");
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  const stored = JSON.parse(localStorage.getItem("focusd-island-scheduled-todos") ?? "[]") as { title: string; date: string }[];
  check(stored.some((todo) => todo.title === "带上合同" && todo.date === later) && $$(".todo-calendar__item--scheduled").length === 2,
    "在以后的日子输入待办并回车，安排到那一天");

  for (let step = 0; step < 3 && !day(older); step += 1) await click(button("上个月"));
  await click(day(older));
  check($(".todo-calendar__day-panel")!.textContent!.includes("整理桌面") && $(".todo-calendar__input") === null, "以前的日子只读，没有输入框");

  const title = $(".todo-calendar__title")!.textContent;
  await click(button("下个月"));
  check($(".todo-calendar__title")!.textContent !== title, "可以切换月份");
  await click(button("回到本月"));
  check(day(today)?.classList.contains("todo-calendar__day--selected"), "“今天”按钮回到本月并选中今天");

  const archived = JSON.parse(localStorage.getItem("focusd-island-archives") ?? "[]") as typeof archives;
  check(archived.length === 2 && archived.every((entry, index) => entry.date === archives[index].date &&
    JSON.stringify(entry.todos) === JSON.stringify(archives[index].todos) && entry.dailyNote === archives[index].dailyNote), "归档数据原样保留");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
