import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

test("todo reorder migrates unversioned settings and respects versioned choices", () => {
  for (const input of [{}, { enableTodoReorder: false }, { enableTodoReorder: true }]) {
    assert.equal(normalizeSettings(input).enableTodoReorder, true);
    assert.equal(normalizeSettings(input).todoReorderVersion, 1);
  }
  assert.equal(normalizeSettings({ enableTodoReorder: false, todoReorderVersion: 1 }).enableTodoReorder, false);
  assert.equal(normalizeSettings({ enableTodoReorder: true, todoReorderVersion: 1 }).enableTodoReorder, true);
});
