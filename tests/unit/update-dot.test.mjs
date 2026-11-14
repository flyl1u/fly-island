import assert from "node:assert/strict";
import test from "node:test";
import { hasUnseenUpdate, normalizeSeenUpdateVersion, updateDotVersion } from "../../src/features/updater/updateDot.ts";
import { loadUpdateDotSeen, saveUpdateDotSeen, UPDATE_DOT_SEEN_EVENT, UPDATE_DOT_SEEN_KEY } from "../../src/features/updater/storage.ts";
import { syncUpdateTodo } from "../../src/features/todos/updateTodo.ts";

const available = { stage: "available", nextVersion: "3.0.10", dismissed: false };

test("a new update shows a dot, viewing hides it, and a later version shows it again", () => {
  assert.equal(hasUnseenUpdate(available, ""), true);
  assert.equal(hasUnseenUpdate(available, "3.0.10"), false);
  assert.equal(hasUnseenUpdate({ ...available, nextVersion: "3.0.11" }, "3.0.10"), true);
  assert.equal(hasUnseenUpdate({ ...available, dismissed: true }, ""), false);
  assert.equal(hasUnseenUpdate({ ...available, nextVersion: "" }, ""), false);
});

test("dot visibility follows exactly the stages of the update todo, including background download", () => {
  for (const stage of ["idle", "checking", "latest", "available", "downloading", "ready", "installing", "done", "error", "disabled"]) {
    for (const dismissed of [true, false]) {
      const state = { ...available, stage, dismissed };
      assert.equal(hasUnseenUpdate(state, ""), syncUpdateTodo([], state, "Update").length > 0);
    }
  }
  assert.equal(updateDotVersion({ ...available, stage: "ready" }), "3.0.10");
});

test("seen version storage tolerates bad data and denied access, and announces successful writes", () => {
  const original = globalThis.window;
  const memory = new Map();
  const events = [];
  globalThis.window = { localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    dispatchEvent: (event) => events.push(event.type) };
  try {
    assert.equal(loadUpdateDotSeen(), "");
    assert.equal(saveUpdateDotSeen("3.0.10"), true);
    assert.equal(memory.get(UPDATE_DOT_SEEN_KEY), "3.0.10");
    assert.equal(loadUpdateDotSeen(), "3.0.10");
    assert.deepEqual(events, [UPDATE_DOT_SEEN_EVENT]);
    for (const bad of ["{broken", "true", "", null, 1, {}]) assert.equal(normalizeSeenUpdateVersion(bad), "");
    assert.equal(normalizeSeenUpdateVersion("3.0.10-beta.2+build.1"), "3.0.10-beta.2+build.1");
    window.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
    assert.equal(loadUpdateDotSeen(), "");
    assert.equal(saveUpdateDotSeen("3.0.11"), false);
    assert.equal(events.length, 1);
  } finally {
    if (original === undefined) delete globalThis.window; else globalThis.window = original;
  }
});
