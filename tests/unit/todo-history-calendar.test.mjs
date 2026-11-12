import assert from "node:assert/strict";
import test from "node:test";
import { dayHeading, groupHistoryByMonth, groupTodoHistory, hasOpenTodoTitled, relativeDay } from "../../src/features/todos/history.ts";
import { collectCalendarTodos, dayDots, getMonthGrid, monthOf, shiftMonth } from "../../src/features/todos/calendar.ts";
import { en, zhCN } from "../../src/i18n/sections/notebook.ts";

const todo = (id, title, completed = false, extra = {}) => ({ id, title, completed, createdAt: 0, ...extra });
const archive = (date, todos) => ({ date, todos, dailyNote: "", savedAt: 0, savedToDisk: false });

test("history starts with today's list, then past days with todos, newest first", () => {
  const days = groupTodoHistory(
    [
      archive("2026-11-08", [todo("a", "A", true), todo("b", "B")]),
      archive("2026-11-11", [todo("c", "saved today")]),
      archive("2026-11-10", [todo("d", "D")]),
      archive("2026-11-09", []),
      archive("2026-11-10", [todo("e", "stale duplicate")]),
      archive("2026-11-07", [todo("u", "update", false, { kind: "update" })]),
    ],
    "2026-11-11",
    [todo("t", "Today", true)],
  );
  assert.deepEqual(days.map((day) => day.date), ["2026-11-11", "2026-11-10", "2026-11-08"]);
  assert.deepEqual(days[0].todos.map((item) => item.id), ["t"]);
  assert.deepEqual(days[1].todos.map((item) => item.id), ["d"]);
  assert.equal(days[2].doneCount, 1);
  assert.deepEqual(groupTodoHistory([], "2026-11-11", []), []);
});

test("the history index preserves newest-first order across months and years", () => {
  const days = ["2026-11-11", "2026-11-05", "2026-10-01", "2025-11-04"].map((date) => ({ date, todos: [], doneCount: 0 }));
  const months = groupHistoryByMonth(days);
  assert.deepEqual([...months.keys()], ["2026-11", "2026-10", "2025-11"]);
  assert.deepEqual(months.get("2026-11"), days.slice(0, 2));
  assert.deepEqual(months.get("2025-11"), [days[3]]);
  assert.equal(groupHistoryByMonth([]).size, 0);
});

test("day headings read today, yesterday, tomorrow or a short date", () => {
  assert.equal(relativeDay("2026-11-01", "2026-11-01"), "today");
  assert.equal(relativeDay("2026-10-31", "2026-11-01"), "yesterday");
  assert.equal(relativeDay("2026-11-02", "2026-11-01"), "tomorrow");
  assert.equal(relativeDay("2026-11-05", "2026-11-01"), null);
  assert.equal(dayHeading("2026-11-10", "2026-11-11", zhCN), "昨天");
  assert.equal(dayHeading("2026-11-09", "2026-11-11", zhCN), "11月9日 周一");
  assert.equal(dayHeading("2026-11-09", "2026-11-11", en), "Mon, Nov 9");
  assert.equal(dayHeading("2026-11-11", "2026-11-11", en), "Today");
  assert.equal(dayHeading("legacy-date", "2026-11-11", en), "legacy-date");
});

test("an unfinished todo counts as already moved when today has it open", () => {
  const today = [todo("x", "Write report "), todo("y", "Done thing", true)];
  assert.equal(hasOpenTodoTitled(today, "Write report"), true);
  assert.equal(hasOpenTodoTitled(today, "Done thing"), false);
});

test("month helpers cross years", () => {
  assert.equal(monthOf("2026-11-11"), "2026-11");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("month grid is the whole Monday-first weeks covering the month", () => {
  // 2026-11-01 is a Sunday: six weeks from Oct 26 to Dec 6.
  const november = getMonthGrid("2026-11");
  assert.equal(november.length, 42);
  assert.equal(november[0], "2026-10-26");
  assert.equal(november[6], "2026-11-01");
  assert.equal(november[41], "2026-12-06");
  // February 2027 starts on a Monday and has 28 days: exactly four weeks.
  const february = getMonthGrid("2027-02");
  assert.deepEqual([february.length, february[0], february[27]], [28, "2027-02-01", "2027-02-28"]);
  assert.equal(getMonthGrid("2026-12").length, 35);
});

test("day dots: up to three, open ones first", () => {
  const item = (completed, scheduled = false) => ({ id: "x", title: "x", completed, scheduled });
  assert.deepEqual(dayDots([]), []);
  assert.deepEqual(dayDots([item(true), item(false)]), ["open", "done"]);
  assert.deepEqual(dayDots([item(false, true), item(true), item(true), item(true)]), ["open", "done", "done"]);
});

test("calendar collects archived, current and scheduled todos by day", () => {
  const days = collectCalendarTodos({
    archives: [archive("2026-11-10", [todo("a", "A", true)]), archive("2026-11-11", [todo("old", "saved today")])],
    todos: [todo("t", "Today"), todo("u", "update", false, { kind: "update" })],
    currentDate: "2026-11-11",
    scheduledTodos: [{ id: "s", title: "Later", date: "2026-11-20", createdAt: 0 }],
  });
  assert.deepEqual(days.get("2026-11-10"), [{ id: "a", title: "A", completed: true, scheduled: false }]);
  assert.deepEqual(days.get("2026-11-11").map((item) => item.id), ["t"]);
  assert.deepEqual(days.get("2026-11-20"), [{ id: "s", title: "Later", completed: false, scheduled: true }]);
  assert.equal(days.has("2026-11-12"), false);
});
