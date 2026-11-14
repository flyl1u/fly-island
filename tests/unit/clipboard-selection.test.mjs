import assert from "node:assert/strict";
import test from "node:test";
import { allVisibleSelected, pruneSelection, selectAllVisible, toggleSelection } from "../../src/features/clipboard/selection.ts";

test("toggle does not mutate the original selection", () => {
  const selected = ["a", "b"];
  assert.deepEqual(toggleSelection(selected, "b"), ["a"]);
  assert.deepEqual(toggleSelection(selected, "c"), ["a", "b", "c"]);
  assert.deepEqual(selected, ["a", "b"]);
});

test("all selects the complete filtered list and preserves hidden selections", () => {
  const visible = Array.from({ length: 500 }, (_, i) => `id-${i}`);
  const selected = selectAllVisible(["hidden"], visible);
  assert.equal(selected.length, 501);
  assert.equal(allVisibleSelected(selected, visible), true);
  assert.deepEqual(selectAllVisible(selected, visible), ["hidden"]);
  assert.deepEqual(selectAllVisible(["a"], ["a", "b", "b"]), ["a", "b"]);
  assert.equal(allVisibleSelected([], []), false);
  assert.deepEqual(selectAllVisible(["hidden"], []), ["hidden"]);
});

test("prune removes deleted entries, not entries hidden by a search or filter", () => {
  assert.deepEqual(pruneSelection(["a", "b", "a", "deleted"], ["a", "b", "c"]), ["a", "b"]);
  assert.deepEqual(pruneSelection(["a"], []), []);
});
