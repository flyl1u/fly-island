import assert from "node:assert/strict";
import test from "node:test";
import { filterSessions } from "../../src/features/agent-status/sessionList.ts";
import { filterQuotaUsages, quotaRings, usageLineCount } from "../../src/features/agent-status/usage.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

const window = (used, name = "") => ({ name, used, resetsAt: null });
const usage = (fields) => ({ updatedAt: 1, fiveHour: null, sevenDay: null, models: [], plan: null, ...fields });

test("plugin-market agents default on and keep a switch of their own", () => {
  const settings = normalizeSettings(null);
  assert.deepEqual([settings.agentShowCursor, settings.agentShowKimiCode, settings.agentShowHermes, settings.agentShowZcode], [true, true, true, true]);
  assert.equal(normalizeSettings({ agentShowCursor: false }).agentShowCursor, false);
  assert.equal(normalizeSettings({ agentShowHermes: "broken" }).agentShowHermes, true);
  assert.deepEqual(normalizeSettings({}).agentQuotaSources, ["claudeCode", "codex", "dsh", "workbuddy"], "the quota checkboxes are unchanged");
});

test("their sessions follow the installed-and-shown flags", () => {
  const sessions = ["claudeCode", "cursor", "kimiCode", "hermes"].map((provider) => ({ provider }));
  assert.deepEqual(filterSessions(sessions, { claudeCode: true, codex: true, cursor: true, kimiCode: false, hermes: false }).map((s) => s.provider), ["claudeCode", "cursor"]);
});

test("Kimi Code and Z Code rings ride along with the quota sources", () => {
  const usages = { claude: null, codex: null, kimi: usage({ fiveHour: window(20), sevenDay: window(50) }), zcode: null, readAt: 1 };
  const filtered = filterQuotaUsages(usages, []);
  assert.equal(filtered.kimi, usages.kimi);
  assert.equal(usageLineCount(filtered), 1);
  assert.equal(usageLineCount({ ...filtered, kimi: null }), 0);
});

test("a Z Code trial balance stands in for the inner ring; other named windows do not", () => {
  const trial = usage({ source: "zcode", models: [window(25, "Trial")] });
  assert.deepEqual(quotaRings(trial), { outer: null, inner: trial.models[0] });
  assert.equal(quotaRings(usage({ source: "hud", models: [window(25, "Fable")] })), null);
});
