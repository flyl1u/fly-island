import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocalTodoKeys } from "../../src/features/todos/normalize.ts";
import {
  adoptTodoFileData,
  queueTodoChange,
  setTodoStoreNotice,
  subscribeTodoFile,
  switchToTodoFile,
  takeTodoStoreNotice,
  todoFileData,
} from "../../src/features/todos/todoStore.ts";

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { crypto: globalThis.crypto, setTimeout: globalThis.setTimeout },
});

const keys = (values) => ({
  "focusd-island-todos": null,
  "focusd-island-archives": null,
  "focusd-island-scheduled-todos": null,
  "focusd-island-daily-note": null,
  "focusd-island-active-todo": null,
  "focusd-island-current-date": null,
  ...values,
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What src-tauri/src/todos/model.rs validate() accepts. */
function assertRustAccepts(data) {
  const item = (todo) => {
    assert.equal(typeof todo.id, "string");
    assert.ok(todo.id.length > 0, "id");
    assert.ok(todo.title.trim() && todo.title.trim() === todo.title, `title ${JSON.stringify(todo.title)}`);
    assert.equal(typeof todo.createdAt, "number");
    assert.ok(Number.isFinite(todo.createdAt));
  };
  assert.equal(typeof data.date, "string");
  data.todos.forEach((todo) => {
    item(todo);
    assert.equal(typeof todo.completed, "boolean");
  });
  data.scheduled.forEach((todo) => {
    item(todo);
    assert.match(todo.date, DATE);
  });
  data.archives.forEach((archive) => {
    assert.ok(archive.date.length > 0);
    archive.todos.forEach(item);
    assert.equal(typeof archive.dailyNote, "string");
    assert.equal(typeof archive.savedAt, "number");
    assert.equal(typeof archive.savedToDisk, "boolean");
    assert.ok(archive.filePath === undefined || typeof archive.filePath === "string");
  });
  assert.equal(typeof data.dailyNote, "string");
  assert.ok(data.activeTodoId === null || (typeof data.activeTodoId === "string" && data.activeTodoId.length > 0));
  // Round-trips through JSON as Rust receives it.
  assert.deepEqual(JSON.parse(JSON.stringify(data)), JSON.parse(JSON.stringify(data)));
}

test("data written by every released version (0.1.1 to 0.2.14) migrates unchanged", () => {
  // Those versions wrote the same shapes; archives from before "save to disk" have no filePath.
  const todos = [
    { id: "8f1c-uuid", title: "写周报", completed: false, createdAt: 1751700000000 },
    { id: "1751700000001-abc", title: "done", completed: true, createdAt: 1751700000001 },
  ];
  const archives = [
    { date: "2026-07-06", todos: [{ id: "x", title: "old", completed: true, createdAt: 1 }], dailyNote: "note", savedAt: 1751800000000, savedToDisk: false },
    { date: "2026-10-30", todos: [], dailyNote: "", savedAt: 1761800000000, savedToDisk: true, filePath: "D:\\notes\\2026-10-30.md" },
  ];
  const data = normalizeLocalTodoKeys(
    keys({
      "focusd-island-todos": JSON.stringify(todos),
      "focusd-island-archives": JSON.stringify(archives),
      "focusd-island-daily-note": "第一行\n第二行",
      "focusd-island-active-todo": "8f1c-uuid",
      "focusd-island-current-date": "2026-11-02",
    }),
  );
  assertRustAccepts(data);
  assert.deepEqual(data.todos, todos);
  assert.deepEqual(data.archives.map((archive) => archive.date), ["2026-10-30", "2026-07-06"]);
  assert.equal(data.archives[1].filePath, undefined);
  assert.equal(data.archives[0].filePath, "D:\\notes\\2026-10-30.md");
  assert.deepEqual([data.date, data.dailyNote, data.activeTodoId, data.scheduled], ["2026-11-02", "第一行\n第二行", "8f1c-uuid", []]);
});

test("the current format with todos for later days migrates", () => {
  const data = normalizeLocalTodoKeys(
    keys({
      "focusd-island-todos": "[]",
      "focusd-island-scheduled-todos": JSON.stringify([
        { id: "b", title: " later ", date: "2026-12-01", createdAt: 2 },
        { id: "a", title: "sooner", date: "2026-11-10", createdAt: 1 },
        { id: "c", title: "bad day", date: "2026-02-30", createdAt: 3 },
      ]),
      "focusd-island-current-date": "2026-11-05",
    }),
  );
  assertRustAccepts(data);
  assert.deepEqual(data.scheduled.map((todo) => [todo.id, todo.title]), [["a", "sooner"], ["b", "later"]]);
});

test("empty, missing and corrupt data migrate to empty values, never to invalid ones", () => {
  const empty = normalizeLocalTodoKeys(keys({}));
  assertRustAccepts(empty);
  assert.deepEqual([empty.todos, empty.archives, empty.scheduled, empty.dailyNote, empty.activeTodoId], [[], [], [], "", null]);
  assert.match(empty.date, DATE);

  const corrupt = normalizeLocalTodoKeys(
    keys({
      "focusd-island-todos": "{ not json",
      "focusd-island-archives": '{"date":"2026-01-01"}',
      "focusd-island-scheduled-todos": "null",
      "focusd-island-active-todo": "",
      "focusd-island-current-date": "",
    }),
  );
  assertRustAccepts(corrupt);
  assert.deepEqual([corrupt.todos, corrupt.archives, corrupt.scheduled, corrupt.activeTodoId, corrupt.date], [[], [], [], null, ""]);

  const partial = normalizeLocalTodoKeys(
    keys({
      "focusd-island-todos": JSON.stringify([{ title: "  no id  " }, { id: "blank", title: "   " }, null, { id: 5, title: "number id" }].filter(Boolean)),
      "focusd-island-archives": JSON.stringify([{ date: "2026-01-02", todos: "junk" }, { todos: [] }, { date: "2026-01-01", todos: [{ title: "kept" }, { id: "x" }] }]),
    }),
  );
  assertRustAccepts(partial);
  assert.deepEqual(partial.todos.map((todo) => todo.title), ["no id", "number id"]);
  assert.deepEqual(partial.archives.map((archive) => [archive.date, archive.todos.length, archive.savedAt]), [["2026-01-02", 0, 0], ["2026-01-01", 1, 0]]);
});

test("a large archive migrates in full", () => {
  const archives = Array.from({ length: 2000 }, (_, day) => ({
    date: `2020-01-${String(day).padStart(4, "0")}`,
    todos: Array.from({ length: 12 }, (_, n) => ({ id: `${day}-${n}`, title: `todo ${n}`, completed: n % 2 === 0, createdAt: day * 100 + n })),
    dailyNote: "x".repeat(300),
    savedAt: day,
    savedToDisk: false,
  }));
  const data = normalizeLocalTodoKeys(keys({ "focusd-island-archives": JSON.stringify(archives) }));
  assertRustAccepts(data);
  assert.equal(data.archives.length, 2000);
  assert.equal(data.archives.reduce((sum, archive) => sum + archive.todos.length, 0), 24000);
});

test("queued saves skip unchanged fields, merge while writing and retry failures", async () => {
  const writes = [];
  let fail = true;
  let release;
  const writer = (change) => {
    writes.push(change);
    if (writes.length === 1) return new Promise((resolve) => (release = () => resolve({ revision: 1, conflicts: [], data: null })));
    if (fail) {
      fail = false;
      return Promise.reject(new Error("disk full"));
    }
    return Promise.resolve({ revision: writes.length, conflicts: [], data: null });
  };
  switchToTodoFile({ date: "2026-11-05", todos: [], scheduled: [], archives: [], dailyNote: "", activeTodoId: null }, 0, writer);
  queueTodoChange({ todos: [] });
  assert.equal(writes.length, 0, "unchanged fields are not written");
  queueTodoChange({ dailyNote: "a" });
  queueTodoChange({ dailyNote: "ab" });
  queueTodoChange({ activeTodoId: null, date: "2026-11-06" });
  assert.deepEqual(writes, [{ dailyNote: "a", baseRevision: 0 }]);
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(writes[1], { dailyNote: "ab", date: "2026-11-06", baseRevision: 1 }, "changes made while writing go out together");
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert.deepEqual(writes[2], { dailyNote: "ab", date: "2026-11-06", baseRevision: 1 }, "a failed write is retried");
  assert.equal(todoFileData().dailyNote, "ab");

  setTodoStoreNotice("reimported");
  assert.equal(takeTodoStoreNotice(), "reimported");
  assert.equal(takeTodoStoreNotice(), null);
});

test("changes from plugins replace only the fields they changed, and win over unsaved edits of those", async () => {
  const writes = [];
  let release;
  const writer = (change) => {
    writes.push(change);
    return new Promise((resolve) => (release = (value) => resolve(value)));
  };
  const base = { date: "2026-11-05", todos: [], scheduled: [], archives: [], dailyNote: "", activeTodoId: null };
  switchToTodoFile(base, 4, writer);
  const seen = [];
  const unsubscribe = subscribeTodoFile((data, changed) => seen.push([[...changed], data.todos.length, data.dailyNote]));

  queueTodoChange({ dailyNote: "typing" }); // in flight
  queueTodoChange({ todos: [{ id: "mine", title: "mine", completed: false, createdAt: 1 }] }); // waiting
  const plugin = { ...base, todos: [{ id: "p", title: "from plugin", completed: false, createdAt: 2 }] };
  adoptTodoFileData(plugin, 5, ["todos"]);
  assert.deepEqual(seen, [[["todos"], 1, "typing"]], "the note being typed is kept");
  assert.equal(todoFileData().todos[0].id, "p");

  release({ revision: 6, conflicts: [], data: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes.length, 1, "the unsaved todo edit was replaced by the plugin's, so nothing more to write");

  // A save that lost a field to a plugin takes that field back from Rust.
  queueTodoChange({ activeTodoId: "p" });
  release({ revision: 8, conflicts: ["activeTodoId"], data: { ...plugin, dailyNote: "typing", activeTodoId: null } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(todoFileData().activeTodoId, null);
  assert.deepEqual(writes.at(-1), { activeTodoId: "p", baseRevision: 6 });
  assert.deepEqual(seen.at(-1)[0], ["activeTodoId"]);
  unsubscribe();
});
