import assert from "node:assert/strict";
import test from "node:test";
import { collectCalendarTodos, dayDots, dayHeading, getMonthGrid, monthOf, relativeDay, shiftMonth } from "../../src/features/todos/calendar.ts";
import { en, zhCN } from "../../src/i18n/sections/notebook.ts";

const todo = (id, title, completed = false, extra = {}) => ({ id, title, completed, createdAt: 0, ...extra });
const archive = (date, todos) => ({ date, todos, dailyNote: "", savedAt: 0, savedToDisk: false });

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
    archives: [
      archive("2026-11-10", [todo("a", "A", true)]),
      archive("2026-11-11", [todo("old", "saved today")]),
      archive("2026-11-10", [todo("duplicate", "Older archive")]),
    ],
    todos: [todo("t", "Today"), todo("u", "update", false, { kind: "update" })],
    currentDate: "2026-11-11",
    scheduledTodos: [{ id: "s", title: "Later", date: "2026-11-20", createdAt: 0 }],
  });
  assert.deepEqual(days.get("2026-11-10"), [{ id: "a", title: "A", completed: true, scheduled: false }]);
  assert.deepEqual(days.get("2026-11-11").map((item) => item.id), ["t"]);
  assert.deepEqual(days.get("2026-11-20"), [{ id: "s", title: "Later", completed: false, scheduled: true }]);
  assert.equal(days.has("2026-11-12"), false);
});
