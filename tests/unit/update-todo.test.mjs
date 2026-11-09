import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../../src/features/todos/updateTodo.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const exports = {};
runInNewContext(source, {
  exports,
  require: (name) => { throw new Error(`Unexpected import: ${name}`); },
  console,
});
const { isUpdateTodo, withoutUpdateTodo, syncUpdateTodo, UPDATE_TODO_ID } = exports;

// Objects built inside the vm realm have a different Object.prototype, so
// normalise before deep-comparing with literals from this realm.
const plain = (value) => JSON.parse(JSON.stringify(value));
const todo = (id, title = "task") => ({ id, title, completed: false, createdAt: 1 });
const ready = { stage: "ready", dismissed: false };

test("a ready update becomes one ordinary todo at the top of the list", () => {
  const todos = [todo("a"), todo("b")];
  const next = syncUpdateTodo(todos, ready, "检测到新版本", 100);
  assert.equal(next.length, 3);
  assert.deepEqual(plain(next[0]), {
    id: UPDATE_TODO_ID,
    title: "检测到新版本",
    completed: false,
    createdAt: 100,
    kind: "update",
  });
  assert.deepEqual(plain(next.slice(1)), todos);
});

test("syncing again with the same state is a no-op", () => {
  const first = syncUpdateTodo([todo("a")], ready, "title", 1);
  assert.equal(syncUpdateTodo(first, ready, "title", 2), first);
});

test("edits, completion and dragging on the update todo survive a resync", () => {
  const first = syncUpdateTodo([], ready, "title", 1);
  const moved = [{ ...first[0], title: "自定义", completed: true }, todo("a")];
  assert.equal(syncUpdateTodo(moved, ready, "title", 2), moved);
});

test("an available update is shown before the download starts", () => {
  const next = syncUpdateTodo([], { stage: "available", dismissed: false }, "title", 1);
  assert.equal(next.length, 1);
  assert.equal(plain(next[0]).kind, "update");
});

test("available, downloading and ready all keep the same todo", () => {
  const first = syncUpdateTodo([], { stage: "available", dismissed: false }, "title", 1);
  assert.equal(
    syncUpdateTodo(first, { stage: "downloading", dismissed: false }, "title", 2),
    first,
  );
  assert.equal(
    syncUpdateTodo(first, { stage: "ready", dismissed: false }, "title", 2),
    first,
  );
});

test("errors, no-update and dismissed states remove the update todo", () => {
  const first = syncUpdateTodo([], { stage: "available", dismissed: false }, "title", 1);
  assert.deepEqual(plain(syncUpdateTodo(first, { stage: "error", dismissed: false }, "title")), []);
  assert.deepEqual(plain(syncUpdateTodo(first, { stage: "latest", dismissed: false }, "title")), []);
  assert.deepEqual(plain(syncUpdateTodo(first, { stage: "available", dismissed: true }, "title")), []);
});

test("dismissing or leaving ready removes the update todo", () => {
  const withUpdate = syncUpdateTodo([todo("a")], ready, "title", 1);
  assert.deepEqual(
    plain(syncUpdateTodo(withUpdate, { stage: "ready", dismissed: true }, "title")),
    [todo("a")],
  );
  assert.deepEqual(
    plain(syncUpdateTodo(withUpdate, { stage: "latest", dismissed: false }, "title")),
    [todo("a")],
  );
});

test("a list without the update todo is returned unchanged when not ready", () => {
  const todos = [todo("a")];
  assert.equal(
    syncUpdateTodo(todos, { stage: "latest", dismissed: false }, "title"),
    todos,
  );
});

test("withoutUpdateTodo strips only the system todo for persistence", () => {
  const todos = [todo("a"), { ...todo(UPDATE_TODO_ID), kind: "update" }, todo("b")];
  assert.deepEqual(plain(withoutUpdateTodo(todos)), [todos[0], todos[2]]);
  assert.equal(isUpdateTodo(todos[1]), true);
  assert.equal(isUpdateTodo(todos[0]), false);
});
