import assert from "node:assert/strict";
import test from "node:test";
import { dshBalanceLabel, dshBalanceRings, primaryDshWallet } from "../../src/features/agent-status/dshUsage.ts";
import { emptyQuotaState, takeQuotaAlerts } from "../../src/features/agent-status/quotaAlerts.ts";
import { filterSessions } from "../../src/features/agent-status/sessionList.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";
import { usageLineCount } from "../../src/features/agent-status/usage.ts";

const now = 1_000_000_000;
const usage = (available = true) => ({ updatedAt: now, available, source: "dshApi", wallets: [{ currency: "CNY", total: "12.3456", granted: "2.3456", toppedUp: "10.00" }] });
const usages = (dsh) => ({ claude: null, codex: null, dsh, readAt: now });

test("DSH wallets show currency and availability without a fabricated percentage", () => {
  assert.equal(dshBalanceLabel(usage()), "¥12.3456");
  assert.deepEqual(dshBalanceRings(usage()), { outer: 100, inner: 100 });
  const empty = { ...usage(false), wallets: [{ currency: "USD", total: "0", granted: "0", toppedUp: "0" }] };
  assert.deepEqual(dshBalanceRings(empty), { outer: 0, inner: 0 });
  assert.equal(dshBalanceLabel(empty), "$0.00");
  assert.equal(usageLineCount(usages(empty)), 1);
  assert.equal(usageLineCount(usages(null)), 0);
  const mixed = { ...usage(), wallets: [...empty.wallets, ...usage().wallets] };
  assert.equal(primaryDshWallet(mixed)?.currency, "CNY", "currencies are not added together");
});

test("DSH balance alerts only on exhaustion or restored availability, never on startup or stale data", () => {
  const state = emptyQuotaState();
  assert.deepEqual(takeQuotaAlerts(state, usages(usage()), 80, now), []);
  const low = takeQuotaAlerts(state, usages(usage(false)), 80, now);
  assert.deepEqual(low.map(({ kind, agent, window }) => ({ kind, agent, window })), [{ kind: "low", agent: "dsh", window: "balance" }]);
  assert.deepEqual(takeQuotaAlerts(state, usages(usage(false)), 80, now), []);
  assert.deepEqual(takeQuotaAlerts(state, usages({ ...usage(), updatedAt: now - 46 * 60_000 }), 80, now), []);
  assert.equal(takeQuotaAlerts(state, usages(usage()), 80, now)[0]?.kind, "reset");
  assert.deepEqual(takeQuotaAlerts(emptyQuotaState(), usages(usage(false)), 80, now), []);
  assert.deepEqual(takeQuotaAlerts(state, usages(usage(false)), 0, now), []);
});

test("DSH source preference survives old settings and filters sessions independently", () => {
  assert.equal(normalizeSettings(null).agentShowDsh, true);
  assert.equal(normalizeSettings({ agentShowDsh: false }).agentShowDsh, false);
  assert.equal(normalizeSettings({ agentShowDsh: "broken" }).agentShowDsh, true);
  const sessions = ["claudeCode", "codex", "dsh"].map((provider) => ({ provider }));
  assert.deepEqual(filterSessions(sessions, { claudeCode: true, codex: true, dsh: false }), sessions.slice(0, 2));
  assert.deepEqual(filterSessions(sessions, { claudeCode: false, codex: false, dsh: true }), sessions.slice(2));
  assert.equal(filterSessions(sessions, { claudeCode: true, codex: true }), sessions, "old callers still show DSH");
});
