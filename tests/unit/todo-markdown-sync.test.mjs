import assert from "node:assert/strict";
import test from "node:test";
import { parseDailyMarkdown } from "../../src/features/todos/parseDailyMarkdown.ts";
import { matchMarkdownTodos, mergeDailyMarkdown } from "../../src/features/todos/mergeDailyMarkdown.ts";
import { formatTodoDocumentAsMarkdown } from "../../src/features/todos/markdown.ts";

const task = (title, id = title, extra = {}) => ({ id, title, completed: false, createdAt: 42, ...extra });
const doc = (todos, dailyNote = "") => ({ todos, dailyNote });
let nextId = 0;
const options = { createId: () => `new-${++nextId}`, now: 100 };
const merge = (base, local, text, extra = {}) => mergeDailyMarkdown(base, local, parseDailyMarkdown(text), { ...options, ...extra });

test("export round trips checklist, unicode, completion and note paragraphs", () => {
  const todos = [task("中文 [链接](https://example.com)"), task("done", "b", { completed: true })];
  const note = "## 今日笔记\n\nfirst\n- a note list\n- [ ] note checkbox\n\nlast";
  assert.deepEqual(parseDailyMarkdown(formatTodoDocumentAsMarkdown(todos, note)), {
    todos: todos.map(({ title, completed }) => ({ title, completed })), dailyNote: note,
  });
});

test("loose bullets, uppercase X, indentation, BOM, CRLF and blank lines", () => {
  assert.deepEqual(parseDailyMarkdown("\uFEFF  * [X] 完成\r\n\r\n\t- [ ] next\r\n  - plain\r\n"), {
    todos: [{ title: "完成", completed: true }, { title: "next", completed: false }, { title: "plain", completed: false }], dailyNote: "",
  });
});

test("empty, broken encoding and half-written checkbox reject the whole import", () => {
  for (const text of ["", " \r\n ", "- [ ]", "- [x", "- [q] bad", "- [ ] good\n- [", "- [ ] good\n- ", "\0", "\uFFFD"]) {
    assert.equal(parseDailyMarkdown(text), null, JSON.stringify(text));
  }
});

test("note-only text cannot authorize clearing existing tasks", () => {
  const base = doc([task("keep")], "old note");
  assert.deepEqual(merge(base, base, "new note").document, doc(base.todos, "new note"));
});

test("file adds, deletes, completes and reorders while metadata survives", () => {
  const base = doc([task("a", "a", { date: "2026-11-19", timer: { endsAt: 9 } }), task("b"), task("c")]);
  const result = merge(base, base, "- [x] c\n- [ ] a\n- [ ] new\n- [ ] another").document;
  assert.deepEqual(result.todos.map(t => [t.title, t.completed]), [["c", true], ["a", false], ["new", false], ["another", false]]);
  assert.equal(result.todos[0].id, "c");
  assert.deepEqual(result.todos[1], base.todos[0]);
  assert.ok(result.todos[2].id.startsWith("new-"));
  assert.equal(result.todos[2].createdAt, 102);
});

test("rename at a position preserves id and unexpressed fields", () => {
  const base = doc([task("a"), task("old", "stable", { timer: 99 }), task("c")]);
  const result = merge(base, base, "- a\n- renamed\n- c").document;
  assert.deepEqual(result.todos[1], { ...base.todos[1], title: "renamed" });
});

test("duplicate titles consume each original once, nearest position first", () => {
  const existing = [task("same", "one"), task("other"), task("same", "two")];
  const rows = parseDailyMarkdown("- [x] same\n- [ ] same\n- other").todos;
  const result = matchMarkdownTodos(existing, rows, options);
  assert.deepEqual(result.map(t => t.id), ["one", "two", "other"]);
  assert.equal(result[0].completed, true);
  assert.equal(result[1].completed, false);
});

test("anchored rename keeps metadata while a different part of the file gains a task", () => {
  const base = doc([task("a"), task("old", "stable", { duration: 25 }), task("c")]);
  const result = merge(base, base, "- a\n- renamed\n- c\n- added").document;
  assert.deepEqual(result.todos[1], { ...base.todos[1], title: "renamed" });
  assert.ok(result.todos[3].id.startsWith("new-"));
});

test("simultaneous independent edits preserve local additions/renames and remote order", () => {
  const base = doc([task("a"), task("b"), task("c")], "note");
  const local = doc([{ ...base.todos[0], title: "island rename" }, ...base.todos.slice(1), task("local new")], "local note");
  const { document, conflicted } = merge(base, local, "- [x] c\n- [ ] a\n- [ ] b\n- remote new\n\nnote");
  assert.deepEqual(document.todos.map(t => t.title), ["c", "island rename", "b", "remote new", "local new"]);
  assert.equal(document.dailyNote, "local note");
  assert.equal(conflicted, false);
});

test("newer side wins rename, delete/edit and note conflicts and flags recovery", () => {
  const base = doc([task("a"), task("b")], "old");
  const local = doc([task("local a", "a"), task("local b", "b")], "local");
  const text = "- remote a\n\nremote note";
  const remoteWins = merge(base, local, text);
  assert.equal(remoteWins.conflicted, true);
  assert.equal(remoteWins.document.dailyNote, "remote note");
  const localWins = merge(base, local, text, { preferLocal: true });
  assert.equal(localWins.conflicted, true);
  assert.equal(localWins.document.dailyNote, "local");
  assert.ok(localWins.document.todos.some(t => t.title === "local b"));
});

test("local deletion stays deleted unless the remote version changed later", () => {
  const base = doc([task("a"), task("b")]);
  assert.deepEqual(merge(base, doc([base.todos[1]]), "- a\n- b").document.todos, [base.todos[1]]);
  assert.equal(merge(base, doc([base.todos[1]]), "- [x] a\n- b").conflicted, true);
});

test("island reorder survives an unrelated remote completion", () => {
  const base = doc([task("a"), task("b"), task("c")]);
  const result = merge(base, doc([...base.todos].reverse()), "- [x] a\n- b\n- c");
  assert.deepEqual(result.document.todos.map(t => t.id), ["c", "b", "a"]);
  assert.equal(result.document.todos[2].completed, true);
});

test("derived update reminder is neither matched nor deleted", () => {
  const update = task("update", "update", { kind: "update" });
  const base = doc([update, task("a")]);
  assert.deepEqual(merge(base, base, "- [x] a").document.todos, [update, { ...base.todos[1], completed: true }]);
});
