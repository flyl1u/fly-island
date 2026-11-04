import assert from "node:assert/strict";
import test from "node:test";
import { formatTodoDocumentAsMarkdown, formatTodosAsMarkdown, getTodoSignature } from "../src/features/todos/markdown.ts";
import {
  DAILY_NOTE_STORAGE_KEY,
  TODOS_STORAGE_KEY,
  TODO_ARCHIVE_STORAGE_KEY,
  TODO_DATE_STORAGE_KEY,
  createTodoId,
  loadCurrentTodoDate,
  loadDailyNote,
  loadActiveTodoId,
  loadLastSavedSignature,
  loadSaveDirectory,
  loadTodoArchives,
  loadTodos,
  saveActiveTodoId,
  saveSaveDirectory,
  saveTodos,
} from "../src/features/todos/storage.ts";

function withStorage(entries, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(entries);
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, crypto: globalThis.crypto } });
  try {
    run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

const todo = (title, completed = false) => ({ id: title, title, completed, createdAt: 1 });

test("todos export as a Markdown checklist followed by the daily note", () => {
  const todos = [todo("写周报", true), todo("Review PR")];
  assert.equal(formatTodosAsMarkdown(todos), "- [x] 写周报\n- [ ] Review PR");
  assert.equal(formatTodoDocumentAsMarkdown(todos, "今天很顺利\n\n"), "- [x] 写周报\n- [ ] Review PR\n\n今天很顺利");
  assert.equal(formatTodoDocumentAsMarkdown([], "only note"), "only note");
  assert.equal(formatTodoDocumentAsMarkdown(todos, "  \n"), "- [x] 写周报\n- [ ] Review PR");
  assert.equal(formatTodoDocumentAsMarkdown([], ""), "");
});

test("the save signature ignores ids and timestamps", () => {
  const a = getTodoSignature("2026-11-03", [{ ...todo("x"), id: "1", createdAt: 1 }], "n");
  const b = getTodoSignature("2026-11-03", [{ ...todo("x"), id: "2", createdAt: 2 }], "n");
  assert.equal(a, b);
  assert.notEqual(a, getTodoSignature("2026-11-03", [todo("x", true)], "n"));
});

test("stored todos drop blank titles and fill missing fields", () => {
  withStorage([[TODOS_STORAGE_KEY, JSON.stringify([{ title: "  保留  ", completed: 1 }, { title: "   " }, { completed: true }])]], () => {
    const [item, ...rest] = loadTodos();
    assert.equal(rest.length, 0);
    assert.equal(item.title, "保留");
    assert.equal(item.completed, true);
    assert.equal(typeof item.id, "string");
    assert.ok(item.id.length > 0);
    assert.equal(typeof item.createdAt, "number");
  });
});

test("corrupted or missing todo data falls back to empty values", () => {
  withStorage([[TODOS_STORAGE_KEY, "{oops"], [TODO_ARCHIVE_STORAGE_KEY, JSON.stringify({ not: "an array" })]], () => {
    assert.deepEqual(loadTodos(), []);
    assert.deepEqual(loadTodoArchives(), []);
    assert.equal(loadDailyNote(), "");
  });
  withStorage([[DAILY_NOTE_STORAGE_KEY, "笔记"], [TODO_DATE_STORAGE_KEY, "2026-01-02"]], () => {
    assert.equal(loadDailyNote(), "笔记");
    assert.equal(loadCurrentTodoDate(), "2026-01-02");
  });
});

test("archives are normalized and sorted newest first", () => {
  const archives = [
    { date: "2026-10-01", todos: [{ title: "a" }, { title: "" }], savedToDisk: 1 },
    { date: "", todos: [] },
    { date: "2026-11-01", dailyNote: 5, filePath: "C:\\notes\\2026-11-01.md", savedAt: 9 },
  ];
  withStorage([[TODO_ARCHIVE_STORAGE_KEY, JSON.stringify(archives)]], () => {
    const loaded = loadTodoArchives();
    assert.deepEqual(loaded.map(a => a.date), ["2026-11-01", "2026-10-01"]);
    assert.deepEqual(loaded[0].todos, []);
    assert.equal(loaded[0].dailyNote, "");
    assert.equal(loaded[0].filePath, "C:\\notes\\2026-11-01.md");
    assert.equal(loaded[0].savedAt, 9);
    assert.equal(loaded[1].todos.length, 1);
    assert.equal(loaded[1].savedToDisk, true);
    assert.equal(loaded[1].filePath, undefined);
  });
});

test("todo ids are unique strings", () => {
  withStorage([], () => {
    const ids = new Set(Array.from({ length: 20 }, () => createTodoId()));
    assert.equal(ids.size, 20);
  });
});

test("blocked storage falls back to defaults instead of throwing", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const blocked = {};
  Object.defineProperty(blocked, "localStorage", { get() { throw new Error("Storage blocked"); } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: blocked });
  try {
    assert.deepEqual(loadTodos(), []);
    assert.deepEqual(loadTodoArchives(), []);
    assert.equal(loadActiveTodoId(), null);
    assert.equal(loadDailyNote(), "");
    assert.equal(loadSaveDirectory(), "");
    assert.equal(loadLastSavedSignature(), null);
    assert.match(loadCurrentTodoDate(), /^\d{4}-\d{2}-\d{2}$/);
    assert.doesNotThrow(() => saveTodos([todo("kept in memory")]));
    assert.doesNotThrow(() => saveActiveTodoId(null));
    assert.equal(saveSaveDirectory("D:/Notes"), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
});

test("scheduled dates are real days and step across months", async () => {
  const { addDays, isDateString } = await import("../src/features/todos/schedule.ts");
  assert.equal(isDateString("2026-11-05"), true);
  assert.equal(isDateString("2026-02-30"), false);
  assert.equal(isDateString("2026-1-5"), false);
  assert.equal(isDateString(20261105), false);
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("due scheduled todos are split off in date order and keep their ids", async () => {
  const { splitDueTodos, toTodoItems } = await import("../src/features/todos/schedule.ts");
  const todos = [
    { id: "c", title: "later", date: "2026-11-09", createdAt: 3 },
    { id: "b", title: "today", date: "2026-11-05", createdAt: 2 },
    { id: "a", title: "missed", date: "2026-11-03", createdAt: 1 },
  ];
  const { due, later } = splitDueTodos(todos, "2026-11-05");
  assert.deepEqual(due.map((todo) => todo.id), ["a", "b"]);
  assert.deepEqual(later.map((todo) => todo.id), ["c"]);
  assert.deepEqual(toTodoItems(due)[0], { id: "a", title: "missed", completed: false, createdAt: 1 });
});

test("stored scheduled todos drop invalid entries and sort by date", async () => {
  const { SCHEDULED_TODOS_STORAGE_KEY, loadScheduledTodos } = await import("../src/features/todos/storage.ts");
  const stored = [
    { id: "2", title: " Later ", date: "2026-12-01", createdAt: 5 },
    { id: "1", title: "Sooner", date: "2026-11-20" },
    { id: "3", title: "", date: "2026-11-21" },
    { id: "4", title: "Bad date", date: "2026-13-01" },
    { title: "No id", date: "2026-11-22" },
    null,
  ];
  withStorage([[SCHEDULED_TODOS_STORAGE_KEY, JSON.stringify(stored)]], () => {
    const todos = loadScheduledTodos();
    assert.deepEqual(todos.map((todo) => [todo.id, todo.title, todo.date]), [["1", "Sooner", "2026-11-20"], ["2", "Later", "2026-12-01"]]);
  });
  withStorage([[SCHEDULED_TODOS_STORAGE_KEY, "{broken"]], () => assert.deepEqual(loadScheduledTodos(), []));
});
