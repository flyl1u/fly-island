import assert from "node:assert/strict";
import test from "node:test";
import { filterSessions } from "../../src/features/agent-status/sessionList.ts";
import { filterQuotaUsages, quotaRings, usageLineCount } from "../../src/features/agent-status/usage.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";
import { emptyQuotaState, takeQuotaAlerts } from "../../src/features/agent-status/quotaAlerts.ts";

const window = (used, name = "") => ({ name, used, resetsAt: null });
const usage = (fields) => ({ updatedAt: 1, fiveHour: null, sevenDay: null, models: [], plan: null, ...fields });

test("plugin-market agents default on and keep a switch of their own", () => {
  const settings = normalizeSettings(null);
  assert.deepEqual([settings.agentShowCursor, settings.agentShowKimiCode, settings.agentShowHermes, settings.agentShowZcode, settings.agentShowAntigravity], [true, true, true, true, true]);
  assert.equal(normalizeSettings({ agentShowCursor: false }).agentShowCursor, false);
  assert.equal(normalizeSettings({ agentShowHermes: "broken" }).agentShowHermes, true);
  assert.deepEqual(normalizeSettings({}).agentQuotaSources, ["claudeCode", "codex", "dsh", "workbuddy", "kimiCode", "zcode", "antigravity"],
    "new users have every ring ticked, the plugin-market ones included");
});

test("Antigravity's ring defaults on for older quota lists and keeps later opt-outs", () => {
  const old = { agentQuotaSources: ["codex", "zcode"] };
  const migrated = normalizeSettings(old);
  assert.deepEqual(migrated.agentQuotaSources, ["codex", "zcode", "antigravity"]);
  assert.deepEqual(normalizeSettings({ ...migrated, ...old }).agentQuotaSources, ["codex", "zcode"]);
  assert.deepEqual(normalizeSettings({ ...old, agentShowAntigravity: false }).agentQuotaSources, ["codex", "zcode"]);
});

test("their sessions follow the installed-and-shown flags", () => {
  const sessions = ["claudeCode", "cursor", "kimiCode", "hermes"].map((provider) => ({ provider }));
  assert.deepEqual(filterSessions(sessions, { claudeCode: true, codex: true, cursor: true, kimiCode: false, hermes: false }).map((s) => s.provider), ["claudeCode", "cursor"]);
});

test("Kimi Code and Z Code rings follow their quota checkboxes like the others", () => {
  const usages = { claude: null, codex: null, kimi: usage({ fiveHour: window(20), sevenDay: window(50) }), zcode: usage({ fiveHour: window(10) }), readAt: 1 };
  const ticked = filterQuotaUsages(usages, ["kimiCode", "zcode"]);
  assert.equal(ticked.kimi, usages.kimi);
  assert.equal(ticked.zcode, usages.zcode);
  assert.equal(usageLineCount(ticked), 1);
  const unticked = filterQuotaUsages(usages, ["claudeCode"]);
  assert.equal(unticked.kimi, null);
  assert.equal(unticked.zcode, null);
  assert.equal(usageLineCount(unticked), 0);
});

test("Kimi Code and Z Code limits raise the same usage alerts as Claude and Codex", () => {
  const state = emptyQuotaState();
  const read = (kimi, zcode) => takeQuotaAlerts(state, { claude: null, codex: null, kimi, zcode, readAt: 1 }, 80, 1);
  assert.deepEqual(read(usage({ fiveHour: window(40) }), usage({ sevenDay: window(30) })), [], "first look notes the level only");
  const alerts = read(usage({ fiveHour: window(85) }), usage({ sevenDay: window(90) }));
  assert.deepEqual(alerts.map((alert) => `${alert.kind}:${alert.agent}:${alert.window}`), ["low:kimi:fiveHour", "low:zcode:sevenDay"]);
  const reset = read(usage({ fiveHour: window(10) }), usage({ sevenDay: window(90) }));
  assert.deepEqual(reset.map((alert) => `${alert.kind}:${alert.agent}`), ["reset:kimi"]);
});

test("a Z Code trial balance and Antigravity's model quota stand in for the inner ring; other named windows do not", () => {
  const trial = usage({ source: "zcode", models: [window(25, "Trial")] });
  assert.deepEqual(quotaRings(trial), { outer: null, inner: trial.models[0] });
  const antigravity = usage({ source: "antigravity", models: [window(70, "Claude Sonnet 4.5"), window(5, "Gemini 4 Neon")] });
  assert.deepEqual(quotaRings(antigravity), { outer: null, inner: antigravity.models[0] }, "the tightest model, as the reader lists it");
  assert.deepEqual(quotaRings(usage({ source: "hud", models: [window(25, "Fable")] })), null);
});
