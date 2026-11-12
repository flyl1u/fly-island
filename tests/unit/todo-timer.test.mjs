import assert from "node:assert/strict";
import test from "node:test";
import {
  activeTodoTimer, createTodoTimer, formatTodoCountdown, isTodoDuration,
  isTodoTimerExpired, normalizeTodoDuration, normalizeTodoTimer, parseTodoMinutes, remainingTodoSeconds,
} from "../../src/features/todos/timer.ts";
import {
  ACTIVE_TODO_STORAGE_KEY, TODO_DURATION_STORAGE_KEY, TODO_TIMER_STORAGE_KEY,
  loadActiveTodoId, loadTodoDuration, loadTodoTimer, loadTodos, saveTodoDuration, saveTodoTimer,
} from "../../src/features/todos/storage.ts";

const NOW = 1_800_000_000_000;
const item = (id, completed = false) => ({ id, title: id, completed, createdAt: NOW });

test("todo duration accepts whole minutes 1–240 and a separate unlimited preference", () => {
  for (const value of [1, 15, 30, 60, 240]) {
    assert.equal(isTodoDuration(value), true);
    assert.equal(parseTodoMinutes(String(value)), value);
    assert.equal(normalizeTodoDuration(value), value);
  }
  for (const value of [0, -1, 241, 1.5, NaN, Infinity, "15", null, undefined, {}, true]) {
    assert.equal(isTodoDuration(value), false);
    assert.equal(normalizeTodoDuration(value), null);
  }
  for (const value of ["", " ", "0", "241", "1.5", "1e2", "0x10", "15m", "-1"]) {
    assert.equal(parseTodoMinutes(value), null, value);
  }
  assert.equal(parseTodoMinutes(" 15 "), 15);
});

test("rounds use absolute deadlines and expiration includes the exact deadline", () => {
  const timer = createTodoTimer("t1", 15, NOW);
  assert.deepEqual(timer, { todoId: "t1", endsAt: NOW + 900_000, durationMinutes: 15, notified: false });
  assert.equal(isTodoTimerExpired(timer, timer.endsAt - 1), false);
  assert.equal(isTodoTimerExpired(timer, timer.endsAt), true);
  assert.equal(isTodoTimerExpired(timer, timer.endsAt + 3_600_000), true);
  assert.equal(createTodoTimer("t1", 241, NOW), null);
  assert.equal(createTodoTimer("", 15, NOW), null);
  assert.equal(createTodoTimer("t1", 15, NaN), null);
  assert.equal(createTodoTimer("t1", 15, Number.MAX_SAFE_INTEGER), null);
  const next = createTodoTimer("t1", timer.durationMinutes, timer.endsAt + 5_000);
  assert.equal(next.endsAt, timer.endsAt + 905_000);
  assert.equal(next.notified, false);
});

test("remaining time rounds up, recovers after a sleep and never goes negative", () => {
  const end = NOW + 60_000;
  assert.equal(remainingTodoSeconds(end, NOW), 60);
  assert.equal(remainingTodoSeconds(end, end - 1), 1);
  assert.equal(remainingTodoSeconds(end, end - 1_001), 2);
  assert.equal(remainingTodoSeconds(end, end), 0);
  assert.equal(remainingTodoSeconds(end, end + 99_000), 0);
  assert.equal(remainingTodoSeconds(NaN, NOW), 0);
  assert.equal(remainingTodoSeconds(end, Infinity), 0);
  assert.equal(formatTodoCountdown(0), "00:00");
  assert.equal(formatTodoCountdown(9), "00:09");
  assert.equal(formatTodoCountdown(61), "01:01");
  assert.equal(formatTodoCountdown(3600), "60:00");
  assert.equal(formatTodoCountdown(14_400), "240:00");
  assert.equal(formatTodoCountdown(-10), "00:00");
  assert.equal(formatTodoCountdown(NaN), "00:00");
});

test("timer normalization rejects broken records and preserves expired/notified rounds", () => {
  const timer = createTodoTimer("t1", 30, NOW);
  assert.deepEqual(normalizeTodoTimer(timer), timer);
  const { notified: _, ...withoutFlag } = timer;
  assert.deepEqual(normalizeTodoTimer(withoutFlag), timer);
  assert.deepEqual(normalizeTodoTimer({ ...timer, notified: true }), { ...timer, notified: true });
  for (const value of [null, [], "bad", {}, { ...timer, todoId: " " }, { ...timer, endsAt: "5" },
    { ...timer, endsAt: Infinity }, { ...timer, endsAt: -1 }, { ...timer, endsAt: 1.5 },
    { ...timer, durationMinutes: 0 }, { ...timer, notified: "false" }]) {
    assert.equal(normalizeTodoTimer(value), null);
  }
});

test("a timer belongs only to the active unfinished regular todo", () => {
  const timer = createTodoTimer("t1", 30, NOW);
  assert.equal(activeTodoTimer(timer, "t1", [item("t1")]), timer);
  assert.equal(activeTodoTimer(timer, "t2", [item("t1"), item("t2")]), null);
  assert.equal(activeTodoTimer(timer, null, [item("t1")]), null);
  assert.equal(activeTodoTimer(timer, "t1", [item("t1", true)]), null);
  assert.equal(activeTodoTimer(timer, "t1", []), null);
  assert.equal(activeTodoTimer(timer, "t1", [{ ...item("t1"), kind: "update" }]), null);
});

function withStorage(entries, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(entries);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  try { run(values, storage); } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

test("timer storage restores deadlines and one-shot notification without changing legacy todos", () => {
  const todos = [item("t1")];
  withStorage([[ACTIVE_TODO_STORAGE_KEY, "t1"], ["focusd-island-todos", JSON.stringify(todos)]], (values) => {
    assert.equal(loadTodoTimer(), null);
    assert.equal(loadTodoDuration(), null);
    const timer = createTodoTimer("t1", 7, NOW);
    assert.equal(saveTodoTimer(timer), true);
    assert.equal(saveTodoDuration(7), true);
    assert.deepEqual(loadTodoTimer(), timer);
    assert.equal(loadTodoDuration(), 7);
    saveTodoTimer({ ...timer, notified: true });
    assert.equal(loadTodoTimer().notified, true);
    assert.deepEqual(loadTodos(), todos);
    assert.equal(loadActiveTodoId(), "t1");
    saveTodoDuration(null);
    assert.equal(values.get(TODO_DURATION_STORAGE_KEY), "null");
    saveTodoTimer(null);
    assert.equal(values.has(TODO_TIMER_STORAGE_KEY), false);
  });
});

test("broken JSON and blocked storage fall back safely, and failed writes report false", () => {
  withStorage([[TODO_TIMER_STORAGE_KEY, "{"], [TODO_DURATION_STORAGE_KEY, "241"]], (_values, storage) => {
    assert.equal(loadTodoTimer(), null);
    assert.equal(loadTodoDuration(), null);
    storage.getItem = () => { throw new Error("blocked"); };
    storage.setItem = () => { throw new Error("full"); };
    storage.removeItem = () => { throw new Error("blocked"); };
    assert.equal(loadTodoTimer(), null);
    assert.equal(loadTodoDuration(), null);
    assert.equal(saveTodoTimer(createTodoTimer("t1", 15, NOW)), false);
    assert.equal(saveTodoTimer(null), false);
    assert.equal(saveTodoDuration(15), false);
  });
});
