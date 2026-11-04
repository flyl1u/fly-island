import assert from "node:assert/strict";
import test from "node:test";
import { hoverFocusAction } from "../src/windows/island/hoverFocus.ts";

const state = (overrides) => ({ expanded: true, hovering: true, holding: false, editing: false, ...overrides });

test("the expanded panel under the cursor takes the focus", () => {
  assert.equal(hoverFocusAction(state()), "take");
  assert.equal(hoverFocusAction(state({ holding: true })), "take");
});

test("the collapsed island never takes the focus", () => {
  assert.equal(hoverFocusAction(state({ expanded: false })), "none");
});

test("leaving or collapsing hands back only a focus the island took", () => {
  assert.equal(hoverFocusAction(state({ hovering: false, holding: true })), "release");
  assert.equal(hoverFocusAction(state({ expanded: false, holding: true })), "release");
  assert.equal(hoverFocusAction(state({ hovering: false })), "none");
});

test("a draft keeps the focus until the island collapses", () => {
  assert.equal(hoverFocusAction(state({ hovering: false, holding: true, editing: true })), "none");
  assert.equal(hoverFocusAction(state({ expanded: false, hovering: false, holding: true, editing: true })), "release");
});
