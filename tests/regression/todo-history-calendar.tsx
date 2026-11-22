// The notebook's tabs and calendar use the real useTodos hook on seeded localStorage.
// Check progress, archived dates, scheduling and scroll bounds in the island's available space.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY, type LocaleCode } from "../../src/i18n";
import { monthOf } from "../../src/features/todos/calendar";
import { setNativePluginEnabled, setNativePluginInstalled } from "../../src/features/plugins/native";
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
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("fly-island-")));
window.addEventListener("beforeunload", () => {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("fly-island-"))) localStorage.removeItem(key);
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
localStorage.setItem("fly-island-current-date", today);
localStorage.setItem("fly-island-save-directory", "");
localStorage.setItem("fly-island-todos", JSON.stringify([
  item("t1", "核对这周的录屏素材"),
  item("t2", "给演示稿补上封面"),
  item("t3", "约下周的评审时间"),
  item("t4", "备份项目文件", true),
]));
localStorage.setItem("fly-island-scheduled-todos", JSON.stringify([{ id: "s1", title: "三天后交材料", date: later, createdAt: 0 }]));
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
localStorage.setItem("fly-island-archives", JSON.stringify(archives));

function Harness({ calendarDate }: { calendarDate?: string }) {
  const { notebookProps } = useTodos({ carryOverIncompleteTodos: false, onStartTodo: () => {}, onMissingSaveDirectory: () => {} });
  const pageMode = calendarDate ? "calendar" : notebookProps.pageMode;
  const height = (pageMode === "calendar" ? TODO_CALENDAR_EXPANDED_ISLAND_HEIGHT : TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT) - ISLAND_CHROME;
  return (
    <div style={{ height }}>
      <TodoNotebook
        {...notebookProps}
        currentDate={calendarDate ?? notebookProps.currentDate}
        pageMode={pageMode}
        enableTodoReorder={false}
        scrollStartRows={6}
      />
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
const switchLocale = (locale: LocaleCode) => act(async () => {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.dispatchEvent(new StorageEvent("storage", { key: LOCALE_STORAGE_KEY }));
});
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
  const fixture = $("#fixture")!;
  const root = createRoot(fixture);
  await act(async () => {
    root.render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>);
  });

  // The view switch.
  const segments = $$(".todo-view-switch__segment");
  check(segments.map((element) => element.getAttribute("aria-label")).join("/") === "待办/笔记/日历", "分段控件依次是待办 / 笔记 / 日历");
  check(segment("today").textContent === "待办" && segments.slice(1).every((element) => element.textContent === ""), "只有当前一段显示文字，其余只有图标");
  check($(".todo-page-toggle:not(.todo-page-toggle--count)") === null, "旧的笔记 / 历史 / 日历单独按钮已去掉");
  check($(".todo-date-picker") !== null && $(".todo-page-toggle--count") !== null, "待办页右上有已安排数量，输入框旁有日期按钮");
  const progress = $<HTMLProgressElement>(".todo-notebook progress")!;
  check(progress.value === 1 && progress.max === 4, "进度条显示完成数和总数");
  await click(button("完成：核对这周的录屏素材"));
  check(progress.value === 2 && progress.max === 4, "勾选待办时更新进度");
  await click(button("标记未完成：核对这周的录屏素材"));
  await frame();
  check(pillMatches("today") && $(".todo-view-switch--ready"), "高亮块对齐当前一段");

  await click(segment("daily"));
  check($(".daily-note") !== null && segment("daily").getAttribute("aria-selected") === "true" && segment("daily").textContent === "笔记", "切到笔记");
  check($(".todo-date-picker") === null && $(".todo-page-toggle--count") === null, "笔记页不显示只属于待办的控件");
  check(pillMatches("daily"), "高亮块滑到笔记");

  // Calendar.
  await click(segment("calendar"));
  check($(".todo-calendar") !== null && segment("calendar").textContent === "日历", "打开日历");
  const weekdays = $$(".todo-calendar__weekday").map((element) => element.textContent);
  check(weekdays[0] === "一" && weekdays[6] === "日", `一周从周一开始（${weekdays.join("")}）`);
  const day = (date: string) => $<HTMLButtonElement>(`.todo-calendar__day[data-date="${date}"]`);
  const todayNumber = day(today)!.querySelector(".todo-calendar__number")!;
  const normalNumberSize = getComputedStyle(todayNumber).fontSize;
  check(!day(today)!.querySelector(".todo-calendar__badge") && getComputedStyle(todayNumber).backgroundColor === "rgb(116, 214, 255)",
    "尚未安装时保留原日历强调色和圆点");
  await act(async () => { setNativePluginInstalled("calendarMarks", true); });
  const usesMarks = () => {
    const cell = day(today)!;
    const number = cell.querySelector(".todo-calendar__number")!;
    return !!cell.querySelector(".todo-calendar__caption-text")
      && getComputedStyle(number).backgroundColor === "rgb(116, 214, 255)"
      && getComputedStyle(number).fontSize === normalNumberSize
      && getComputedStyle(number).boxShadow === "none" && getComputedStyle(cell).boxShadow.includes("inset")
      && cell.getAttribute("aria-current") === "date";
  };
  for (let step = 0; step < 60 && !usesMarks(); step += 1) await frame();
  check(usesMarks(), "启用日历标记后日期字号不变，今天仍用实心圆，选中时整格描边");
  check(sideBySide() && detail().dataset.date === today && $(".todo-day-detail__title")?.textContent === "今天" && dayList().textContent!.includes("核对这周的录屏素材"),
    "日历在左侧，今天的待办默认显示在右侧");
  if (!day(yesterday)) await click(button("上个月"));
  check(day(yesterday)?.querySelectorAll(".todo-calendar__dot").length === 2 && day(yesterday)?.querySelector(".todo-calendar__dot--open"),
    "有待办的日子带圆点，没完成的是强调色");
  await click(day(yesterday));
  check(detail().dataset.date === yesterday && $(".todo-day-detail__summary")?.textContent === "1/2 已完成" &&
    $(".todo-day-row--done")?.textContent === "回邮件", "日历保留归档日期的清单和完成情况");
  await click(button("把“写周报”加到今天"));
  check(button("已在今天的列表里")?.disabled && detail().dataset.date === yesterday, "在日历中将旧待办加到今天，不会重复添加");
  if (!day(older)) await click(button("上个月"));
  check(day(older)?.querySelector(".todo-calendar__dot--done") && !day(older)?.querySelector(".todo-calendar__dot--open"), "全部完成的是灰点");
  const goToday = button("回到今天")!;
  if (!goToday.disabled) await click(goToday);
  check($(".todo-calendar__add input") !== null, "今天可以直接添加待办");
  check(dayList().textContent!.includes("写周报"), "回到今天可以看到恢复的待办");
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
  const stored = JSON.parse(localStorage.getItem("fly-island-scheduled-todos") ?? "[]") as { title: string; date: string }[];
  check(stored.some((todo) => todo.title === "带上合同" && todo.date === later) && $$(".todo-day-row--scheduled").length === 2,
    "在以后的日子输入待办并回车，安排到那一天");
  await click(button("删除已安排的待办：带上合同"));
  check($$(".todo-day-row--scheduled").length === 1 && !localStorage.getItem("fly-island-scheduled-todos")!.includes("带上合同"),
    "可以在当天的清单删除已安排待办");

  for (let step = 0; step < 3 && !day(older); step += 1) await click(button("上个月"));
  await click(day(older));
  check(dayList().textContent!.includes("整理桌面") && $(".todo-calendar__add") === null, "以前的日子只读，没有输入框");

  const title = $(".todo-calendar__title")!.textContent;
  await click(button("下个月"));
  check($(".todo-calendar__title")!.textContent !== title && detail().dataset.date === older, "翻月浏览时右侧保留选中的日期");
  await click(goToday);
  check(day(today)?.getAttribute("aria-pressed") === "true" && goToday.disabled, "今天按钮回到本月并选中今天");

  for (let step = 0; step < 5 && !day(old); step += 1) await click(button("上个月"));
  await click(day(old));
  const selectedNumber = day(old)!.querySelector(".todo-calendar__number")!;
  const selectedOutline = () => getComputedStyle(selectedNumber).boxShadow === "none" && getComputedStyle(day(old)!).boxShadow.includes("inset");
  for (let step = 0; step < 60 && !selectedOutline(); step += 1) await frame();
  check(selectedOutline(), "选中的日期只描整格，号码不再单独画圈");
  const longList = dayList();
  longList.scrollTop = longList.scrollHeight;
  check(longList.scrollTop > 0 && fits(), "跨月归档的长清单在日历右侧独立滚动");
  await click(day(oldEarlier));
  await click(day(old));
  check(dayList().scrollTop === 0, "切回长清单时从开头阅读");
  await click(goToday);

  // A six-week month stays fully visible without taking height from the day list.
  for (let step = 0; step < 12 && $$(".todo-calendar__day").length !== 42; step += 1) await click(button("下个月"));
  const grid = $(".todo-calendar__grid")!;
  check($$(".todo-calendar__day").length === 42 && grid.scrollHeight <= grid.clientHeight + 1 && sideBySide() && fits() && dayList().clientHeight >= 150,
    `六周月历可完整显示，右侧列表有 ${dayList().clientHeight}px`);
  fixture.style.width = "360px";
  fixture.style.setProperty("--island-font-scale", "1.2");
  check(sideBySide() && fits() && grid.scrollHeight <= grid.clientHeight + 1 && detail().scrollWidth <= detail().clientWidth + 1,
    "窄面板在最大字号下仍显示六周，日历和待办不会横向溢出");
  fixture.style.removeProperty("width");
  fixture.style.removeProperty("--island-font-scale");
  if (!goToday.disabled) await click(goToday);
  await click(segment("today"));
  check(todayTitles().includes("写周报") && $<HTMLProgressElement>(".todo-notebook progress")?.max === 5, "回到待办页时总数包含恢复的待办");

  const archived = JSON.parse(localStorage.getItem("fly-island-archives") ?? "[]") as typeof archives;
  check(archived.length === archives.length && archived.every((entry, index) => entry.date === archives[index].date &&
    JSON.stringify(entry.todos) === JSON.stringify(archives[index].todos) && entry.dailyNote === archives[index].dailyNote), "归档数据原样保留");

  // Use a known workday as today so this test never depends on the machine's year or weekday.
  const fixtureToday = "2027-01-06";
  await act(async () => {
    root.render(<StrictMode><I18nProvider><Harness key="holiday-cases" calendarDate={fixtureToday} /></I18nProvider></StrictMode>);
  });

  const badgeOf = (node: Element | null | undefined) => node?.querySelector(".todo-calendar__badge")?.textContent ?? "";
  const captionOf = (node: Element | null | undefined) => node?.querySelector(".todo-calendar__caption-text")?.textContent ?? "";

  const newYear = day("2027-01-01");
  check(captionOf(newYear) === "元旦" && newYear?.classList.contains("todo-calendar__day--rest") && badgeOf(newYear) === "休"
    && newYear.getAttribute("aria-label")?.includes("元旦，休息日"), "官方假期显示名称和「休」，读屏播报休息日");

  const plainSaturday = day("2027-01-09");
  check(plainSaturday?.classList.contains("todo-calendar__day--rest") && badgeOf(plainSaturday) === ""
    && /^(初|十|廿|三)/.test(captionOf(plainSaturday)) && plainSaturday.getAttribute("aria-label")?.includes("休息日"),
    "普通周六只用底色区分，仍显示农历并播报休息日");

  const plainWeekday = day(fixtureToday);
  const todaySpoken = plainWeekday?.getAttribute("aria-label") ?? "";
  check(plainWeekday?.getAttribute("aria-current") === "date" && badgeOf(plainWeekday) === ""
    && todaySpoken.startsWith("今天，") && !/休息日|调休上班/.test(todaySpoken) && /^(初|十|廿|三)/.test(captionOf(plainWeekday)),
    "普通工作日恰好是今天时，读屏不会误报休息或调休");

  const makeUpDay = day("2027-01-31");
  check(badgeOf(makeUpDay) === "班" && makeUpDay?.classList.contains("todo-calendar__day--work")
    && !makeUpDay.classList.contains("todo-calendar__day--rest") && makeUpDay.getAttribute("aria-label")?.includes("调休上班"),
    "调休上班的周日显示「班」并播报调休上班，不按休息日标红");

  check($$(".todo-calendar__weekday--rest").length === 2
    && $$(".todo-calendar__weekday--rest").map((element) => element.textContent).join("") === "六日",
    "星期行的周六周日标红");

  check(captionOf(day("2027-01-20")) === "大寒", "节气当天显示节气名");
  await switchLocale("en");
  check(document.documentElement.lang === "en" && !$(".todo-calendar__grid--marks")
    && !$(".todo-calendar__badge, .todo-calendar__caption-text, .todo-calendar__weekday--rest")
    && day(fixtureToday)?.getAttribute("aria-current") === "date",
    "切到英文时保留普通日历，不显示中国大陆节假日、农历和休班标记");
  await switchLocale("zh-CN");
  check(captionOf(newYear) === "元旦" && badgeOf(makeUpDay) === "班", "切回中文后恢复已启用的日历标记");
  await act(async () => { setNativePluginEnabled("calendarMarks", false); });
  check(!$(".todo-calendar__grid--marks") && badgeOf(newYear) === "" && captionOf(newYear) === "",
    "停用后恢复原始布局、角标和说明");
  await act(async () => { setNativePluginEnabled("calendarMarks", true); });

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
