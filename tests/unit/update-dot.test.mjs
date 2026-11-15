import assert from "node:assert/strict";
import test from "node:test";
import { updateDotVersion } from "../../src/features/updater/updateDot.ts";
import { syncUpdateTodo } from "../../src/features/todos/updateTodo.ts";

const pending = { stage: "available", nextVersion: "3.0.10" };

test("a pending update shows a dot with its version, whatever page is open", () => {
  for (const stage of ["available", "downloading", "ready", "error"]) {
    assert.equal(updateDotVersion({ ...pending, stage }), "3.0.10", stage);
  }
});

test("no dot without a pending update", () => {
  for (const stage of ["idle", "checking", "latest", "installing", "done", "disabled"]) {
    assert.equal(updateDotVersion({ ...pending, stage }), "", stage);
  }
  assert.equal(updateDotVersion({ stage: "available", nextVersion: "" }), "");
});

test("the inner dot of the todo row follows the same stages as the outer dot", () => {
  for (const stage of ["idle", "checking", "latest", "available", "downloading", "ready", "installing", "done", "error", "disabled"]) {
    const hasVersion = pending.nextVersion !== "";
    const rowShown = syncUpdateTodo([], { stage, dismissed: false, hasVersion }, "Update").length > 0;
    assert.equal(updateDotVersion({ ...pending, stage }) !== "", rowShown, stage);
  }
});

test("a failed install keeps the row and the dot, until a check finds nothing", () => {
  const row = syncUpdateTodo([], { stage: "error", dismissed: false, hasVersion: true }, "Update", 1);
  assert.equal(row.length, 1);
  assert.equal(updateDotVersion({ stage: "latest", nextVersion: "" }), "");
});
