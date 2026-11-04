import assert from "node:assert/strict";
import test from "node:test";
import { runTodoApiCall } from "../../src/features/todos/apiCommands.ts";
import { dispatchLocalApiRequest } from "../../src/features/local-api/dispatch.ts";

const todo = (id, title, completed = false) => ({ id, title, completed, createdAt: 1 });
const state = (overrides = {}) => ({
  date: "2026-11-04",
  todos: [todo("a", "First"), todo("b", "Second", true)],
  scheduledTodos: [],
  activeTodoId: "a",
  dailyNote: "line one",
  ...overrides,
});
const create = { id: "new-id", now: 42 };
const run = (method, params, current = state()) => runTodoApiCall(method, params, current, create);

test("todos.list returns the day, todos, scheduled todos and the active todo", () => {
  const { result, change } = run("todos.list", null);
  assert.equal(change, undefined);
  assert.deepEqual(result, {
    ok: true,
    data: { date: "2026-11-04", todos: state().todos, scheduled: [], activeTodoId: "a" },
  });
});

test("todos.add puts a trimmed todo at the top of today's list", () => {
  const { result, change } = run("todos.add", { title: "  Call Bob  " });
  const added = { id: "new-id", title: "Call Bob", completed: false, createdAt: 42 };
  assert.deepEqual(result, { ok: true, data: added });
  assert.deepEqual(change.todos, [added, ...state().todos]);
});

test("todos.add with today's date adds to the list and a later date schedules it", () => {
  assert.equal(run("todos.add", { title: "x", date: "2026-11-04" }).change.todos.length, 3);
  const later = run("todos.add", { title: "x", date: "2026-11-09" });
  assert.deepEqual(later.change, { schedule: { title: "x", date: "2026-11-09" } });
});

test("todos.add rejects bad titles and dates", () => {
  for (const params of [{}, { title: "  " }, { title: 3 }, { title: "x".repeat(501) }, null, []]) {
    assert.equal(run("todos.add", params).result.status, 400, JSON.stringify(params));
  }
  assert.equal(run("todos.add", { title: "x", date: "11/09/2026" }).result.status, 400);
  assert.equal(run("todos.add", { title: "x", date: "2026-11-03" }).result.status, 400);
});

test("todos.update changes only the given fields", () => {
  const { result, change } = run("todos.update", { id: "a", completed: true });
  assert.deepEqual(result.data, { ...todo("a", "First"), completed: true });
  assert.deepEqual(change.todos[1], state().todos[1]);

  const renamed = run("todos.update", { id: "b", title: " New " });
  assert.equal(renamed.result.data.title, "New");
  assert.equal(renamed.result.data.completed, true);
});

test("todos.update and todos.remove report unknown ids and bad fields", () => {
  assert.equal(run("todos.update", { id: "zzz", completed: true }).result.status, 404);
  assert.equal(run("todos.update", { id: "a", completed: "yes" }).result.status, 400);
  assert.equal(run("todos.update", { id: "a", title: "" }).result.status, 400);
  assert.equal(run("todos.remove", { id: "zzz" }).result.status, 404);
});

test("todos.remove drops the todo", () => {
  const { result, change } = run("todos.remove", { id: "a" });
  assert.deepEqual(result, { ok: true, data: { id: "a" } });
  assert.deepEqual(change.todos.map(item => item.id), ["b"]);
});

test("note.get and note.set read, replace and append the daily note", () => {
  assert.deepEqual(run("note.get").result.data, { date: "2026-11-04", note: "line one" });
  assert.equal(run("note.set", { note: "fresh" }).change.dailyNote, "fresh");
  assert.equal(run("note.set", { append: "line two" }).change.dailyNote, "line one\nline two");
  assert.equal(run("note.set", { append: "only" }, state({ dailyNote: "" })).change.dailyNote, "only");
  assert.equal(run("note.set", {}).result.status, 400);
  assert.equal(run("note.set", { note: "a", append: "b" }).result.status, 400);
});

test("dispatch finds handlers by own name and turns throws into 500", async () => {
  const handlers = {
    "todos.list": () => ({ ok: true, data: 1 }),
    "todos.add": async () => ({ ok: true, data: 2 }),
    broken: () => {
      throw new Error("boom");
    },
  };
  assert.deepEqual(await dispatchLocalApiRequest(handlers, "todos.list", null), { ok: true, data: 1 });
  assert.deepEqual(await dispatchLocalApiRequest(handlers, "todos.add", null), { ok: true, data: 2 });
  assert.deepEqual(await dispatchLocalApiRequest(handlers, "broken", null), { ok: false, status: 500, error: "boom" });
  assert.equal((await dispatchLocalApiRequest(handlers, "toString", null)).status, 404);
  assert.equal((await dispatchLocalApiRequest(handlers, "missing", null)).status, 404);
});
