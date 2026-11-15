import assert from "node:assert/strict";
import test from "node:test";
import { selectRotatingTodos, nextTodoRotationIndex } from "../../src/features/todos/todoRotation.ts";
import { normalizeSettings, DEFAULT_SETTINGS } from "../../src/features/appearance/settings.ts";

const todo = (id, extra = {}) => ({ id, title: id, completed: false, createdAt: 0, ...extra });

test("rotation selects the first N unfinished real tasks without changing their order", () => {
  const todos = [todo("done", { completed: true }), todo("a"), todo("update", { kind: "update" }), todo("b"), todo("c")];
  assert.deepEqual(selectRotatingTodos(todos, 2).map(t => t.id), ["a", "b"]);
  assert.deepEqual(selectRotatingTodos([], 3), []);
  assert.equal(selectRotatingTodos(todos, 0).length, 1);
  assert.equal(selectRotatingTodos(Array.from({ length: 12 }, (_, i) => todo(String(i))), 99).length, 10);
  assert.equal(selectRotatingTodos(todos, NaN).length, 3);
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
  const saved = { rotateTodos: true, showIdleTodoCount: false, todoRotationCount: 7, todoRotationMode: "scroll", todoRotationSeconds: 9, todoScrollSpeed: 25 };
  const normalized = normalizeSettings(saved);
  for (const [key, value] of Object.entries(saved)) assert.equal(normalized[key], value);
  const invalid = normalizeSettings({ todoRotationCount: 99, todoRotationSeconds: -5, todoScrollSpeed: NaN, todoRotationMode: "bad" });
  assert.equal(invalid.todoRotationCount, 10);
  assert.equal(invalid.todoRotationSeconds, 1);
  assert.equal(invalid.todoScrollSpeed, DEFAULT_SETTINGS.todoScrollSpeed);
  assert.equal(invalid.todoRotationMode, "switch");
  assert.equal(normalizeSettings({}).rotateTodos, false);
});
