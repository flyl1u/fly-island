// pnpm dev, then open /tests/regression/todo-history-calendar.html. The todo page's four views
// behind one segmented control (Todos / Notes / History / Calendar), the history (days by date,
// newest first, the last week open and older days folded; an unfinished todo moves to today) and
// the calendar (Monday-first month, today filled, dots on days with todos, a day's list below
// that takes new todos for today or later), driven through the real useTodos hook on seeded
// localStorage. Each view sits in the box the island gives it.
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
import { TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_CALENDAR_EXPANDED_ISLAND_HEIGHT } from "../../src/windows/island/layout";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
mockIPC(() => null);
// Island padding, header and gap above the page (layout.ts).
const ISLAND_CHROME = 86;

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
const old = addDays(today, -20);
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
  { date: old, todos: [item("d1", "很久以前的事")], dailyNote: "", savedAt: 0, savedToDisk: false },
];
localStorage.setItem("focusd-island-archives", JSON.stringify(archives));

function Harness() {
  const { notebookProps } = useTodos({ carryOverIncompleteTodos: false, onStartTodo: () => {}, onMissingSaveDirectory: () => {} });
  const height = (notebookProps.pageMode === "calendar" ? TODO_CALENDAR_EXPANDED_ISLAND_HEIGHT : TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT) - ISLAND_CHROME;
  return (
    <div style={{ height }}>
      <TodoNotebook {...notebookProps} enableTodoReorder={false} scrollStartRows={6} />
    </div>
  );
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
const segment = (view: string) => $<HTMLButtonElement>(`.todo-view-switch__segment[data-view="${view}"]`)!;
const click = (element: HTMLElement | null) => act(async () => { element!.click(); });
const frame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const type = (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const fits = () => {
  const notebook = $(".todo-notebook")!;
  return notebook.scrollHeight <= notebook.clientHeight + 1;
};
const todayTitles = () => $$(".todo-list .todo-title").map((element) => element.textContent);
const pillMatches = (view: string) => {
  const pill = $(".todo-view-switch__pill")!.getBoundingClientRect();
  const active = segment(view).getBoundingClientRect();
  return Math.abs(pill.width - active.width) < 1;
};

try {
  await act(async () => {
    createRoot(document.getElementById("fixture")!).render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>);
  });

  // The view switch.
  const segments = $$(".todo-view-switch__segment");
  check(segments.map((element) => element.getAttribute("aria-label")).join("/") === "待办/笔记/历史/日历", "一个分段控件，四段依次是待办 / 笔记 / 历史 / 日历");
  check(segment("today").textContent === "待办" && segments.slice(1).every((element) => element.textContent === ""), "只有当前一段显示文字，其余只有图标");
  check($(".todo-page-toggle:not(.todo-page-toggle--count)") === null, "旧的笔记 / 历史 / 日历单独按钮已去掉");
  check($(".todo-date-picker") !== null && $(".todo-page-toggle--count") !== null, "待办页右上有已安排数量，输入框旁有日期按钮");
  await frame();
  check(pillMatches("today") && $(".todo-view-switch--ready"), "高亮块对齐当前一段");

  await click(segment("daily"));
  check($(".daily-note") !== null && segment("daily").getAttribute("aria-selected") === "true" && segment("daily").textContent === "笔记", "切到笔记");
  check($(".todo-date-picker") === null && $(".todo-page-toggle--count") === null, "笔记页不显示只属于待办的控件");
  check(pillMatches("daily"), "高亮块滑到笔记");

  // History.
  await click(segment("history"));
  const headings = $$(".todo-history__heading").map((element) => element.textContent);
  check(headings[0] === "今天" && headings[1] === "昨天" && headings.length === 3, `历史按天分组，最近的在前，标题读作今天 / 昨天 / 日期（${headings.join("、")}）`);
  check(/^\d+月\d+日 周[一二三四五六日]$/.test(headings[2]!), `更早的日子写成"11月9日 周一"的样子（${headings[2]}）`);
  const yesterdayDay = $(`.todo-history__day[data-date="${yesterday}"]`)!;
  check(yesterdayDay.querySelector(".todo-history__summary")!.textContent === "1/2 已完成" && yesterdayDay.querySelector(".todo-history__bar > span")!.getAttribute("style")!.includes("50%"),
    "每天右边写着 1/2 已完成，带一条进度");
  check(yesterdayDay.querySelector(".todo-day-row--done")!.textContent === "回邮件", "完成项打勾、变灰");
  const moveButton = button("把“写周报”加到今天")!;
  check(moveButton.textContent === "移到今天" && getComputedStyle(moveButton.parentElement!).opacity === "0", `"移到今天"平时隐藏，悬停才出现`);
  check($(`.todo-history__day[data-date="${today}"] .todo-day-row__action`) === null, "今天的待办没有移到今天按钮");
  check($(`.todo-history__day[data-date="${old}"]`) === null && $(".todo-history__older")?.textContent === "更早 · 1 天", "七天以前的折叠在\"更早\"后面");
  await click($(".todo-history__older"));
  check($(`.todo-history__day[data-date="${old}"]`) !== null, "点\"更早\"展开");
  check(fits(), "历史页只在列表里滚动");

  await click(moveButton);
  const moved = button("已在今天的列表里");
  check(moved?.disabled === true && getComputedStyle(moved.parentElement!).opacity === "1", "移到今天后变成\"已在今天的列表里\"，不会重复添加");
  check($(`.todo-history__day[data-date="${today}"]`)!.textContent!.includes("写周报"), "今天一组里多了这条");

  await click(segment("today"));
  check(todayTitles().includes("写周报") && todayTitles().includes("今天的事"), `点"待办"回到今天的列表（${todayTitles().join("、")}）`);

  // Calendar.
  await click(segment("calendar"));
  check($(".todo-calendar") !== null && segment("calendar").textContent === "日历", "打开日历");
  const weekdays = $$(".todo-calendar__weekday").map((element) => element.textContent);
  check(weekdays[0] === "一" && weekdays[6] === "日", `一周从周一开始（${weekdays.join("")}）`);
  const day = (date: string) => $<HTMLButtonElement>(`.todo-calendar__day[data-date="${date}"]`);
  const todayNumber = day(today)!.querySelector(".todo-calendar__number")!;
  check(getComputedStyle(todayNumber).backgroundColor === "rgb(116, 214, 255)" && day(today)!.getAttribute("aria-current") === "date", "今天是实心的强调色圆");
  check(day(yesterday)?.querySelectorAll(".todo-calendar__dot").length === 2 && day(yesterday)?.querySelector(".todo-calendar__dot--open"),
    "有待办的日子带圆点，没完成的是强调色");
  check(day(older)?.querySelector(".todo-calendar__dot--done") && !day(older)?.querySelector(".todo-calendar__dot--open"), "全部完成的是灰点");
  check($(".todo-calendar__day-title")?.textContent === "今天" && $(".todo-calendar__list")!.textContent!.includes("写周报"), "默认选中今天，下方列出今天的待办");
  check($(".todo-calendar__add input") !== null, "今天可以直接添加待办");
  check(fits(), "日历页放得进岛里");

  if (!day(later)) await click(button("下个月"));
  check(day(later)?.querySelector(".todo-calendar__dot--open"), "已安排的日子带强调色圆点");
  await click(day(later));
  check(getComputedStyle(day(later)!.querySelector(".todo-calendar__number")!).boxShadow !== "none", "选中的日子画一圈描边");
  check($(".todo-day-row--scheduled")?.textContent === "三天后交材料", "点以后的日子看到当天已安排的待办");
  const input = $<HTMLInputElement>(".todo-calendar__add input")!;
  check(input.placeholder === "添加待办", "输入框写着\"添加待办\"");
  await type(input, "带上合同");
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  const stored = JSON.parse(localStorage.getItem("focusd-island-scheduled-todos") ?? "[]") as { title: string; date: string }[];
  check(stored.some((todo) => todo.title === "带上合同" && todo.date === later) && $$(".todo-day-row--scheduled").length === 2,
    "在以后的日子输入待办并回车，安排到那一天");

  for (let step = 0; step < 3 && !day(older); step += 1) await click(button("上个月"));
  await click(day(older));
  check($(".todo-calendar__list")!.textContent!.includes("整理桌面") && $(".todo-calendar__add") === null, "以前的日子只读，没有输入框");

  const title = $(".todo-calendar__title")!.textContent;
  await click(button("下个月"));
  check($(".todo-calendar__title")!.textContent !== title, "可以切换月份");
  await click(button("回到本月"));
  check(day(today)?.classList.contains("todo-calendar__day--selected") && button("回到本月")!.disabled, "\"今天\"按钮回到本月并选中今天");

  // A six-week month still fits, with room for two rows in the day list.
  for (let step = 0; step < 12 && $$(".todo-calendar__day").length !== 42; step += 1) await click(button("下个月"));
  const list = $(".todo-calendar__list")!;
  check($$(".todo-calendar__day").length === 42 && fits() && list.clientHeight >= 56, `六周的月份也放得下，下方列表还有 ${list.clientHeight}px`);

  const archived = JSON.parse(localStorage.getItem("focusd-island-archives") ?? "[]") as typeof archives;
  check(archived.length === archives.length && archived.every((entry, index) => entry.date === archives[index].date &&
    JSON.stringify(entry.todos) === JSON.stringify(archives[index].todos) && entry.dailyNote === archives[index].dailyNote), "归档数据原样保留");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
