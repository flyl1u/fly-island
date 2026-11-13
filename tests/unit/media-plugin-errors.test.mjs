import test from "node:test";
import assert from "node:assert/strict";
import { pluginErrorKey } from "../../src/features/media/pluginError.ts";
test("plugin error kinds map to translated keys", () => {
  const keys = { NeedsClose:"needsClose",UserDeclined:"userDeclined",LegacyConflict:"legacyConflict",Unsupported:"unsupported",Network:"network",HashMismatch:"hashMismatch",Busy:"busy",Io:"io" };
  for (const [kind,key] of Object.entries(keys)) assert.equal(pluginErrorKey(kind),key);
});
