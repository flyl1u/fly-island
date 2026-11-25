import assert from "node:assert/strict";
import { test } from "node:test";
import { pluginFailureCode } from "../../src/features/plugins/errors.ts";

test("market errors show only recognized IPC codes, not paths or URLs", () => {
  assert.equal(pluginFailureCode("plugin_index_unavailable"), "plugin_index_unavailable");
  assert.equal(pluginFailureCode(new Error("plugin_start_failed")), "plugin_start_failed");
  assert.equal(pluginFailureCode("Could not open C:\\users\\secret"), undefined);
  assert.equal(pluginFailureCode("https://secret@example.com/catalog"), undefined);
  assert.equal(pluginFailureCode({ toString: () => "plugin_index_unavailable" }), undefined);
});
