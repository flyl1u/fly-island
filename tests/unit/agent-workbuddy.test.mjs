import assert from "node:assert/strict";
import test from "node:test";
import { emptyQuotaState, takeQuotaAlerts } from "../../src/features/agent-status/quotaAlerts.ts";
import { filterSessions } from "../../src/features/agent-status/sessionList.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

const now = 1_000_000_000;
const credits = (remaining) => ({ remaining, total: 500, updatedAt: now });
const usages = (workbuddy) => ({ claude: null, codex: null, dsh: null, workbuddy, readAt: now });

test("WorkBuddy credits alert only when they run out or come back, never on startup or stale data", () => {
  const state = emptyQuotaState();
  assert.deepEqual(takeQuotaAlerts(state, usages(credits(20)), 80, now), []);
  const low = takeQuotaAlerts(state, usages(credits(0)), 80, now);
  assert.deepEqual(low.map(({ kind, agent, window }) => ({ kind, agent, window })), [{ kind: "low", agent: "workbuddy", window: "balance" }]);
  assert.deepEqual(takeQuotaAlerts(state, usages(credits(0)), 80, now), []);
  assert.deepEqual(takeQuotaAlerts(state, usages({ ...credits(30), updatedAt: now - 46 * 60_000 }), 80, now), []);
  assert.equal(takeQuotaAlerts(state, usages(credits(30)), 80, now)[0]?.kind, "reset");
  assert.deepEqual(takeQuotaAlerts(emptyQuotaState(), usages(credits(0)), 80, now), [], "already empty at startup");
  assert.deepEqual(takeQuotaAlerts(state, usages(credits(0)), 0, now), [], "alerts switched off");
});

test("the WorkBuddy session source defaults on and its sessions follow it", () => {
  assert.equal(normalizeSettings(null).agentShowWorkbuddy, true);
  assert.equal(normalizeSettings({ agentShowWorkbuddy: false }).agentShowWorkbuddy, false);
  assert.equal(normalizeSettings({ agentShowWorkbuddy: "broken" }).agentShowWorkbuddy, true);
  assert.deepEqual(normalizeSettings({ agentShowWorkbuddy: false }).agentQuotaSources, ["claudeCode", "codex", "dsh"], "old data migrates the ring with the source");
  const sessions = ["claudeCode", "workbuddy"].map((provider) => ({ provider }));
  assert.deepEqual(filterSessions(sessions, { claudeCode: true, codex: true, workbuddy: false }), sessions.slice(0, 1));
  assert.equal(filterSessions(sessions, { claudeCode: true, codex: true }), sessions, "callers without the flag still show WorkBuddy");
});
