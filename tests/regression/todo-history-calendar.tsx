// pnpm dev, then open /tests/regression/todo-history-calendar.html. The notebook's tabs and both
// side-by-side date browsers use the real useTodos hook on seeded localStorage, with the space
// each view gets in the island. Check month/day selection, restore, scheduling and scroll bounds.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { monthOf } from "../../src/features/todos/calendar";
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
const oldMonth = monthOf(addDays(today, -60));
const old = `${oldMonth}-21`;
const oldEarlier = `${oldMonth}-05`;
const lastYear = addDays(today, -400);
const later = addDays(today, 3);
const item = (id: string, title: string, completed = false) => ({ id, title, completed, createdAt: 0 });
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
localStorage.setItem("focusd-island-current-date", today);
localStorage.setItem("focusd-island-save-directory", "");
localStorage.setItem("focusd-island-todos", JSON.stringify([
  item("t1", "核对这周的录屏素材"),
  item("t2", "给演示稿补上封面"),
  item("t3", "约下周的评审时间"),
  item("t4", "备份项目文件", true),
]));
localStorage.setItem("focusd-island-scheduled-todos", JSON.stringify([{ id: "s1", title: "三天后交材料", date: later, createdAt: 0 }]));
const archives = [
  { date: yesterday, todos: [item("y1", "写周报"), item("y2", "回邮件", true)], dailyNote: "", savedAt: 0, savedToDisk: false },
  { date: older, todos: [item("o1", "整理桌面", true)], dailyNote: "旧笔记", savedAt: 0, savedToDisk: true, filePath: "D:\\Notes\\x.md" },
  {
    date: old, todos: [
      item("d1", "确认合作方的反馈和交付时间，把还需要补拍的镜头记下来"),
      ...["整理原始素材", "补拍开场", "校对字幕", "截取封面画面", "导出预览视频", "核对文件名", "归档确认邮件"]
        .map((title, index) => item(`d${index + 2}`, title, index > 3)),
    ], dailyNote: "", savedAt: 0, savedToDisk: false,
  },
  { date: oldEarlier, todos: [item("e1", "讨论拍摄提纲")], dailyNote: "", savedAt: 0, savedToDisk: false },
  { date: lastYear, todos: [item("l1", "去年的记录")], dailyNote: "", savedAt: 0, savedToDisk: false },
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
  return notebook.scrollHeight <= notebook.clientHeight + 1 && notebook.scrollWidth <= notebook.clientWidth + 1;
};
const detail = () => $(".todo-day-detail")!;
const dayList = () => $(".todo-day-detail__body")!;
const sideBySide = () => {
  const sidebar = $(".todo-date-overview__sidebar")!.getBoundingClientRect();
  const panel = detail().getBoundingClientRect();
  return sidebar.right < panel.left && Math.abs(sidebar.top - panel.top) < 1;
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
  const monthPicker = $<HTMLSelectElement>(".todo-history__month select")!;
  const chooseMonth = (month: string) => act(async () => {
    monthPicker.value = month;
    monthPicker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const historyDate = (date: string) => $(`.todo-history__date[data-date="${date}"]`);
  const indexedDates = () => $$(".todo-history__date").map((element) => element.dataset.date);
  check(sideBySide() && detail().dataset.date === today && historyDate(today)?.getAttribute("aria-pressed") === "true",
    "历史左侧是日期目录，右侧默认选中最新的日期");
  check(indexedDates().join() === [today, yesterday, older].filter((date) => monthOf(date) === monthOf(today)).join(),
    "目录只列所选月有记录的日期，最新的在前");
  check($$(".todo-day-detail").length === 1 && dayList().textContent!.includes("核对这周的录屏素材") && !dayList().textContent!.includes("写周报"),
    "右侧只渲染选中日期的待办");
  check($(".todo-day-row__action") === null, "今天的待办没有移到今天按钮");

  await chooseMonth(monthOf(lastYear));
  check(detail().dataset.date === lastYear && dayList().textContent!.includes("去年的记录"), "用月份选择器直接跳到跨年的记录");
  await chooseMonth(oldMonth);
  check(indexedDates().join() === [old, oldEarlier].join() && detail().dataset.date === old, "切到另一个月自动选中该月最新日期");
  const longList = dayList();
  longList.scrollTop = longList.scrollHeight;
  check(longList.scrollTop > 0 && fits(), "长清单在右侧独立滚动");
  await click(historyDate(oldEarlier));
  check(detail().dataset.date === oldEarlier && dayList().textContent!.includes("讨论拍摄提纲"), "点目录日期就切换右侧内容");
  await click(historyDate(old));
  check(dayList().scrollTop === 0, "切回长清单时从开头阅读");

  await chooseMonth(monthOf(yesterday));
  await click(historyDate(yesterday));
  check($(".todo-day-detail__title")?.textContent === "昨天" && $(".todo-day-detail__summary")?.textContent === "1/2 已完成",
    "历史详情显示日期标题和完成情况");
  check($(".todo-day-row--done")!.textContent === "回邮件", "完成项打勾、变灰");
  const moveButton = button("把“写周报”加到今天")!;
  check(moveButton.textContent === "移到今天" && getComputedStyle(moveButton.parentElement!).opacity === "0", `"移到今天"平时隐藏，悬停才出现`);
  await click(moveButton);
  const moved = button("已在今天的列表里");
  check(moved?.disabled === true && getComputedStyle(moved.parentElement!).opacity === "1", "移到今天后变成\"已在今天的列表里\"，不会重复添加");
  check(detail().dataset.date === yesterday, "恢复待办后停留在当前历史日期");
  await chooseMonth(monthOf(today));
  await click(historyDate(today));
  check(dayList().textContent!.includes("写周报"), "切回今天可以看到刚恢复的待办");

  await click(segment("today"));
  check(todayTitles().includes("写周报") && todayTitles().includes("核对这周的录屏素材"), "点待办回到今天的列表");

  // Calendar.
  await click(segment("calendar"));
  check($(".todo-calendar") !== null && segment("calendar").textContent === "日历", "打开日历");
  const weekdays = $$(".todo-calendar__weekday").map((element) => element.textContent);
  check(weekdays[0] === "一" && weekdays[6] === "日", `一周从周一开始（${weekdays.join("")}）`);
  const day = (date: string) => $<HTMLButtonElement>(`.todo-calendar__day[data-date="${date}"]`);
  const todayNumber = day(today)!.querySelector(".todo-calendar__number")!;
  check(getComputedStyle(todayNumber).backgroundColor === "rgb(116, 214, 255)" && day(today)!.getAttribute("aria-current") === "date", "今天是实心的强调色圆");
  check(sideBySide() && detail().dataset.date === today && $(".todo-day-detail__title")?.textContent === "今天" && dayList().textContent!.includes("写周报"),
    "日历在左侧，今天的待办默认显示在右侧");
  if (!day(yesterday)) await click(button("上个月"));
  check(day(yesterday)?.querySelectorAll(".todo-calendar__dot").length === 2 && day(yesterday)?.querySelector(".todo-calendar__dot--open"),
    "有待办的日子带圆点，没完成的是强调色");
  if (!day(older)) await click(button("上个月"));
  check(day(older)?.querySelector(".todo-calendar__dot--done") && !day(older)?.querySelector(".todo-calendar__dot--open"), "全部完成的是灰点");
  const goToday = button("回到今天")!;
  if (!goToday.disabled) await click(goToday);
  check($(".todo-calendar__add input") !== null, "今天可以直接添加待办");
  check(fits(), "日历页放得进岛里");

  if (!day(later)) await click(button("下个月"));
  check(day(later)?.querySelector(".todo-calendar__dot--open"), "已安排的日子带强调色圆点");
  await click(day(later));
  check(day(later)?.getAttribute("aria-pressed") === "true" && detail().dataset.date === later, "选中的日子和右侧日期一致");
  check($(".todo-day-row--scheduled")?.textContent === "三天后交材料", "点以后的日子看到当天已安排的待办");
  const input = $<HTMLInputElement>(".todo-calendar__add input")!;
  check(input.placeholder === "添加待办", "输入框写着\"添加待办\"");
  await type(input, "带上合同");
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
  const stored = JSON.parse(localStorage.getItem("focusd-island-scheduled-todos") ?? "[]") as { title: string; date: string }[];
  check(stored.some((todo) => todo.title === "带上合同" && todo.date === later) && $$(".todo-day-row--scheduled").length === 2,
    "在以后的日子输入待办并回车，安排到那一天");
  await click(button("删除已安排的待办：带上合同"));
  check($$(".todo-day-row--scheduled").length === 1 && !localStorage.getItem("focusd-island-scheduled-todos")!.includes("带上合同"),
    "可以在当天的清单删除已安排待办");

  for (let step = 0; step < 3 && !day(older); step += 1) await click(button("上个月"));
  await click(day(older));
  check(dayList().textContent!.includes("整理桌面") && $(".todo-calendar__add") === null, "以前的日子只读，没有输入框");

  const title = $(".todo-calendar__title")!.textContent;
  await click(button("下个月"));
  check($(".todo-calendar__title")!.textContent !== title && detail().dataset.date === older, "翻月浏览时右侧保留选中的日期");
  await click(goToday);
  check(day(today)?.getAttribute("aria-pressed") === "true" && goToday.disabled, "今天按钮回到本月并选中今天");

  // A six-week month stays fully visible without taking height from the day list.
  for (let step = 0; step < 12 && $$(".todo-calendar__day").length !== 42; step += 1) await click(button("下个月"));
  const grid = $(".todo-calendar__grid")!;
  check($$(".todo-calendar__day").length === 42 && grid.scrollHeight <= grid.clientHeight + 1 && sideBySide() && fits() && dayList().clientHeight >= 150,
    `六周月历可完整显示，右侧列表有 ${dayList().clientHeight}px`);
  const fixture = $("#fixture")!;
  fixture.style.width = "360px";
  check(sideBySide() && fits() && detail().scrollWidth <= detail().clientWidth + 1, "窄面板的日历和待办不会横向溢出");
  fixture.style.removeProperty("width");
  if (!goToday.disabled) await click(goToday);

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
