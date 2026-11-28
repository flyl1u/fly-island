import assert from "node:assert/strict";
import test from "node:test";
import { placeCollapsedPriority } from "../../src/features/appearance/collapsedPriority.ts";

test("reorders displayed priorities without moving an uninstalled clock row", () => {
  const saved = ["agent", "centeredClock", "lyrics", "todo"];
  assert.deepEqual(placeCollapsedPriority(saved, ["todo", "agent", "lyrics"], ["centeredClock"]),
    ["todo", "centeredClock", "agent", "lyrics"]);
});

test("reorders all rows after the optional plugin is installed", () => {
  assert.deepEqual(placeCollapsedPriority(["agent", "lyrics", "todo", "centeredClock"],
    ["centeredClock", "todo", "agent", "lyrics"], []), ["centeredClock", "todo", "agent", "lyrics"]);
});
