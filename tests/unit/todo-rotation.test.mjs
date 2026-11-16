import assert from "node:assert/strict";
import test from "node:test";
import { selectRotatingTodos, nextTodoRotationIndex } from "../../src/features/todos/todoRotation.ts";
import { normalizeSettings, DEFAULT_SETTINGS } from "../../src/features/appearance/settings.ts";
import {
  ACTIVE_TODO_STORAGE_KEY, ACTIVE_TODOS_STORAGE_KEY, TODO_TIMER_STORAGE_KEY, TODO_TIMERS_STORAGE_KEY,
  loadActiveTodoIds, loadTodoTimers, saveActiveTodoIds, saveTodoTimers,
} from "../../src/features/todos/storage.ts";

const todo = (id, extra = {}) => ({ id, title: id, completed: false, createdAt: 0, ...extra });

test("rotation selects every started unfinished task in notebook order", () => {
  const todos = [todo("done", { completed: true }), todo("a"), todo("update", { kind: "update" }), todo("b"), todo("c")];
  assert.deepEqual(selectRotatingTodos(todos, ["c", "done", "a", "update", "missing"]).map(t => t.id), ["a", "c"]);
  assert.deepEqual(selectRotatingTodos([], ["a"]), []);
  assert.deepEqual(selectRotatingTodos(todos, []), []);
  const many = Array.from({ length: 12 }, (_, i) => todo(String(i)));
  assert.equal(selectRotatingTodos(many, many.map(t => t.id)).length, 12);
  assert.equal(todos.length, 5);
});

test("rotation wraps and recovers when the selected task was completed or removed", () => {
  const ids = ["a", "b", "c"];
  assert.equal(nextTodoRotationIndex(ids, "a"), 1);
  assert.equal(nextTodoRotationIndex(ids, "c"), 0);
  assert.equal(nextTodoRotationIndex(ids, "removed"), 0);
  assert.equal(nextTodoRotationIndex(ids, null), 0);
  assert.equal(nextTodoRotationIndex(["a"], "a"), 0);
  assert.equal(nextTodoRotationIndex([], "a"), -1);
});

test("rotation preferences survive normalization, and old or malformed settings keep safe defaults", () => {
  const saved = { rotateTodos: true, showIdleTodoCount: false, todoRotationMode: "scroll", todoRotationSeconds: 9, todoScrollSpeed: 25 };
  const normalized = normalizeSettings(saved);
  for (const [key, value] of Object.entries(saved)) assert.equal(normalized[key], value);
  const invalid = normalizeSettings({ todoRotationCount: 99, todoRotationSeconds: -5, todoScrollSpeed: NaN, todoRotationMode: "bad" });
  assert.equal(Object.hasOwn(invalid, "todoRotationCount"), false);
  assert.equal(invalid.todoRotationSeconds, 1);
  assert.equal(invalid.todoScrollSpeed, DEFAULT_SETTINGS.todoScrollSpeed);
  assert.equal(invalid.todoRotationMode, "switch");
  assert.equal(normalizeSettings({}).rotateTodos, false);
  assert.equal(DEFAULT_SETTINGS.rotateTodos, false);
});

test("multi-task storage migrates legacy values and keeps the single-task formats", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const legacy = { todoId: "a", endsAt: 1_900_000_000_000, durationMinutes: 15, notified: false };
  const values = new Map([[ACTIVE_TODO_STORAGE_KEY, "a"], [TODO_TIMER_STORAGE_KEY, JSON.stringify(legacy)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  try {
    assert.deepEqual(loadActiveTodoIds(), ["a"]);
    assert.deepEqual(loadTodoTimers(), [legacy]);
    values.set(ACTIVE_TODOS_STORAGE_KEY, "{");
    values.set(TODO_TIMERS_STORAGE_KEY, "{}");
    assert.deepEqual(loadActiveTodoIds(), ["a"], "damaged extension falls back to the legacy ID");
    assert.deepEqual(loadTodoTimers(), [legacy], "invalid root falls back to the legacy timer");
    const second = { ...legacy, todoId: "b", durationMinutes: 7, endsAt: legacy.endsAt + 10_000 };
    saveActiveTodoIds(["a", "b"]);
    saveTodoTimers([legacy, second], "a");
    assert.deepEqual(loadActiveTodoIds(), ["a", "b"]);
    assert.deepEqual(loadTodoTimers(), [legacy, second]);
    assert.equal(values.get(ACTIVE_TODO_STORAGE_KEY), "a");
    assert.deepEqual(JSON.parse(values.get(TODO_TIMER_STORAGE_KEY)), legacy);
    saveActiveTodoIds(["b"]);
    saveTodoTimers([second], "b");
    assert.deepEqual(loadActiveTodoIds(), ["b"]);
    assert.deepEqual(JSON.parse(values.get(TODO_TIMER_STORAGE_KEY)), second);
    values.set(ACTIVE_TODOS_STORAGE_KEY, JSON.stringify([null, "", " ", "b", "b", 4]));
    values.set(TODO_TIMERS_STORAGE_KEY, JSON.stringify([null, second, { ...second, endsAt: -1 }, second]));
    assert.deepEqual(loadActiveTodoIds(), ["b"]);
    assert.deepEqual(loadTodoTimers(), [second]);
    saveActiveTodoIds([]);
    saveTodoTimers([], null);
    assert.equal(values.has(ACTIVE_TODO_STORAGE_KEY), false);
    assert.equal(values.has(TODO_TIMER_STORAGE_KEY), false);
    assert.deepEqual(loadActiveTodoIds(), []);
    assert.deepEqual(loadTodoTimers(), []);
    values.set(ACTIVE_TODO_STORAGE_KEY, "a");
    values.set(TODO_TIMER_STORAGE_KEY, JSON.stringify(legacy));
    assert.deepEqual(loadActiveTodoIds(), [], "an explicit empty array never resurrects a legacy task");
    assert.deepEqual(loadTodoTimers(), [], "an explicit empty array never resurrects a legacy round");
    values.delete(ACTIVE_TODO_STORAGE_KEY);
    values.delete(TODO_TIMER_STORAGE_KEY);
    values.set(ACTIVE_TODOS_STORAGE_KEY, "{");
    values.set(TODO_TIMERS_STORAGE_KEY, "{");
    assert.deepEqual(loadActiveTodoIds(), []);
    assert.deepEqual(loadTodoTimers(), []);
    storage.getItem = () => { throw new Error("blocked"); };
    storage.setItem = storage.removeItem = () => { throw new Error("blocked"); };
    assert.deepEqual(loadActiveTodoIds(), []);
    assert.deepEqual(loadTodoTimers(), []);
    assert.doesNotThrow(() => { saveActiveTodoIds(["b"]); saveTodoTimers([second], "b"); });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
});
