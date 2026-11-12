import assert from "node:assert/strict";
import test from "node:test";
import { groupTodoHistory, hasOpenTodoTitled } from "../../src/features/todos/history.ts";
import { collectCalendarTodos, getMonthGrid, monthOf, shiftMonth } from "../../src/features/todos/calendar.ts";

const todo = (id, title, completed = false, extra = {}) => ({ id, title, completed, createdAt: 0, ...extra });
const archive = (date, todos) => ({ date, todos, dailyNote: "", savedAt: 0, savedToDisk: false });

test("history lists past days with todos, newest first, without today or empty days", () => {
  const days = groupTodoHistory(
    [
      archive("2026-11-08", [todo("a", "A", true), todo("b", "B")]),
      archive("2026-11-11", [todo("c", "today")]),
      archive("2026-11-10", [todo("d", "D")]),
      archive("2026-11-09", []),
      archive("2026-11-10", [todo("e", "stale duplicate")]),
      archive("2026-11-07", [todo("u", "update", false, { kind: "update" })]),
    ],
    "2026-11-11",
  );
  assert.deepEqual(days.map((day) => day.date), ["2026-11-10", "2026-11-08"]);
  assert.deepEqual(days[0].todos.map((item) => item.id), ["d"]);
  assert.equal(days[1].doneCount, 1);
});

test("an unfinished todo counts as already restored when today has it open", () => {
  const today = [todo("x", "Write report "), todo("y", "Done thing", true)];
  assert.equal(hasOpenTodoTitled(today, "Write report"), true);
  assert.equal(hasOpenTodoTitled(today, "Done thing"), false);
});

test("month helpers cross years", () => {
  assert.equal(monthOf("2026-11-11"), "2026-11");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("month grid is six weeks starting on the chosen weekday", () => {
  // 2026-11-01 is a Sunday.
  const monday = getMonthGrid("2026-11", 1);
  assert.equal(monday.length, 42);
  assert.equal(monday[0], "2026-10-26");
  assert.equal(monday[6], "2026-11-01");
  const sunday = getMonthGrid("2026-11", 0);
  assert.equal(sunday[0], "2026-11-01");
  assert.equal(sunday[41], "2026-12-12");
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
