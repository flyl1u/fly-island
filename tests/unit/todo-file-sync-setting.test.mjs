import assert from "node:assert/strict";
import test from "node:test";
import { loadTodoFileSync, saveTodoFileSync, TODO_FILE_SYNC_CHANGED_EVENT, TODO_FILE_SYNC_STORAGE_KEY } from "../../src/features/todos/storage.ts";

function withStorage(value, run, blocked = false) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(value === null ? [] : [[TODO_FILE_SYNC_STORAGE_KEY, value]]);
  const events = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: {
      getItem: key => { if (blocked) throw new Error("blocked"); return values.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw new Error("quota"); values.set(key, value); },
    },
    dispatchEvent: event => events.push(event.type),
  } });
  try { run(values, events); }
  finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
}

test("file sync is opt-in and accepts only the literal true string", () => {
  for (const value of [null, "", "false", "1", "TRUE", "{}", "null", '"true"']) withStorage(value, () => assert.equal(loadTodoFileSync(), false));
  withStorage("true", () => assert.equal(loadTodoFileSync(), true));
});

test("setting writes notify same-window listeners and blocked storage stays safe", () => {
  withStorage(null, (values, events) => {
    assert.equal(saveTodoFileSync(true), true);
    assert.equal(values.get(TODO_FILE_SYNC_STORAGE_KEY), "true");
    assert.deepEqual(events, [TODO_FILE_SYNC_CHANGED_EVENT]);
    assert.equal(saveTodoFileSync(false), true);
    assert.equal(loadTodoFileSync(), false);
  });
  withStorage(null, (_values, events) => {
    assert.equal(loadTodoFileSync(), false);
    assert.equal(saveTodoFileSync(true), false);
    assert.deepEqual(events, []);
  }, true);
});
