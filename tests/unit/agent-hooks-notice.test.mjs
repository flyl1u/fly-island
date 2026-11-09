import assert from "node:assert/strict";
import test from "node:test";
import { getAgentHooksNotice } from "../../src/features/agent-status/status.ts";

const state = (codex, claudeCode, scriptsOutdated = false) => ({ codex, claudeCode, scriptsOutdated });

test("no notice before the state is read or when the hooks are current", () => {
  assert.equal(getAgentHooksNotice(null), null);
  assert.equal(getAgentHooksNotice(state("current", "current")), null);
  // Only one agent installed is fine: Install/Repair would not change anything for it.
  assert.equal(getAgentHooksNotice(state("notInstalled", "current")), null);
});

test("hooks or scripts from an older version ask for an update", () => {
  assert.equal(getAgentHooksNotice(state("current", "outdated")), "update");
  assert.equal(getAgentHooksNotice(state("outdated", "notInstalled")), "update");
  assert.equal(getAgentHooksNotice(state("current", "current", true)), "update");
});

test("nothing installed asks for an install", () => {
  assert.equal(getAgentHooksNotice(state("notInstalled", "notInstalled")), "install");
});
