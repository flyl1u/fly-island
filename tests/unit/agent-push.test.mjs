import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AGENT_PUSH_SETTINGS, normalizeAgentPushSettings } from "../../src/features/agent-status/push/storage.ts";

test("phone push is off by default and pushes only after 5 minutes away", () => {
  assert.deepEqual(normalizeAgentPushSettings(null), DEFAULT_AGENT_PUSH_SETTINGS);
  assert.equal(DEFAULT_AGENT_PUSH_SETTINGS.enabled, false);
  assert.equal(DEFAULT_AGENT_PUSH_SETTINGS.awayMinutes, 5);
});

test("saved push settings are read safely", () => {
  const read = normalizeAgentPushSettings({ enabled: true, server: "  http://nas:8080 ", events: { completed: false, extra: true }, awayMinutes: 7 });
  assert.deepEqual(read, {
    enabled: true,
    server: "http://nas:8080",
    events: { waiting: true, completed: false, failed: true },
    awayMinutes: 5,
  });
  assert.equal(normalizeAgentPushSettings({ awayMinutes: 0 }).awayMinutes, 0);
  assert.equal(normalizeAgentPushSettings({ server: 42 }).server, "");
});
