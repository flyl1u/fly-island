import test from "node:test";
import assert from "node:assert/strict";
import { pluginErrorKey, pluginNotice } from "../../src/features/media/pluginError.ts";
test("plugin error kinds map to translated keys", () => {
  const keys = { NeedsClose:"needsClose",UserDeclined:"userDeclined",LegacyConflict:"legacyConflict",Unsupported:"unsupported",Network:"network",HashMismatch:"hashMismatch",Busy:"busy",Io:"io",Blocked:"blocked",DriveUnavailable:"driveUnavailable",LoaderExists:"loaderExists" };
  for (const [kind,key] of Object.entries(keys)) assert.equal(pluginErrorKey(kind),key);
});
test("plugin notices hide developer details and offer the next step", () => {
  const base = { done: false, removed: false, restarted: false };
  assert.equal(pluginNotice({ ...base, error: null }), null);
  assert.deepEqual(pluginNotice({ ...base, error: { kind: "NeedsClose", detail: "cloudmusic.exe is running" } }),
    { tone: "error", key: "needsClose", detail: undefined, action: "closeAndRetry" });
  assert.equal(pluginNotice({ ...base, error: { kind: "Network", detail: "error sending request" } }).detail, undefined);
  assert.equal(pluginNotice({ ...base, error: { kind: "Io", detail: "Access is denied" } }).detail, "Access is denied");
  // The helper's specific causes carry their own advice, so the raw OS text stays hidden.
  assert.deepEqual(pluginNotice({ ...base, error: { kind: "Blocked", detail: "Access is denied. (os error 5)" } }),
    { tone: "error", key: "blocked", detail: undefined, action: undefined });
  assert.equal(pluginNotice({ ...base, error: { kind: "DriveUnavailable", detail: "Z:\\Music" } }).key, "driveUnavailable");
  assert.equal(pluginNotice({ ...base, error: { kind: "LegacyConflict", detail: "C:\betterncm\plugins" } }).action, "openPlugins");
  assert.deepEqual(pluginNotice({ ...base, error: null, done: true }), { tone: "status", key: "success", action: "restart" });
  assert.deepEqual(pluginNotice({ ...base, error: null, done: true, restarted: true }), { tone: "status", key: "restarted" });
  assert.deepEqual(pluginNotice({ ...base, error: null, done: true, removed: true }), { tone: "status", key: "removed" });
});
