import test from "node:test";
import assert from "node:assert/strict";
import { reorderIndex } from "../../src/features/todos/reorderIndex.ts";

for (const [name, mids, y, source, expected] of [
  ["上拖", [20, 60, 100], 35, 3, 1],
  ["下拖", [60, 100, 140], 120, 0, 2],
  ["拖出首行", [20, 60], -100, 2, 0],
  ["拖出末行", [60, 100], 900, 0, 2],
  ["原地不动", [20, 100], 60, 1, 1],
  ["只有一项", [], 900, 0, 0],
]) test(name, () => assert.equal(reorderIndex(mids, y, source), expected));
