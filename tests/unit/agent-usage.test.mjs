import assert from "node:assert/strict";
import test from "node:test";
import { isStale, tightestWindow, untilReset, usageLevel } from "../../src/features/agent-status/usage.ts";

const window = (name, used, resetsAt = null) => ({ name, used, resetsAt });

test("usage levels and the time until a window resets", () => {
  assert.deepEqual([usageLevel(0), usageLevel(49), usageLevel(50), usageLevel(84), usageLevel(85), usageLevel(100)], ["low", "low", "medium", "medium", "high", "high"]);
  const now = 1_000_000_000;
  assert.deepEqual(untilReset(now + (34 * 60 + 10) * 60_000 + 30_000, now), { days: 1, hours: 10, minutes: 11 });
  assert.deepEqual(untilReset(now + 59_000, now), { days: 0, hours: 0, minutes: 1 });
  assert.equal(untilReset(now - 1, now), null);
  assert.equal(untilReset(null, now), null);
});

test("the reset time shown is the fullest window's", () => {
  const usage = { updatedAt: 0, fiveHour: window("", 27), sevenDay: window("", 47), models: [window("Fable", 100)], plan: null };
  assert.equal(tightestWindow(usage)?.name, "Fable");
  assert.equal(tightestWindow({ ...usage, models: [] })?.used, 47);
  assert.equal(tightestWindow({ updatedAt: 0, fiveHour: null, sevenDay: null, models: [], plan: null }), null);
  assert.equal(isStale(usage, 16 * 60_000), true);
  assert.equal(isStale(usage, 10 * 60_000), false);
  assert.equal(isStale({ ...usage, updatedAt: null }, 10 ** 12), false);
});

test("one usage line per agent that reports numbers, and the card names the source", async () => {
  const { EMPTY_USAGES, hasUsageNumbers, usageLineCount, usageSourceLines } = await import("../../src/features/agent-status/usage.ts");
  const { zhCN: agentZh } = await import("../../src/i18n/sections/agent.ts");
  const zhCN = agentZh.usage;
  const usage = (overrides = {}) => ({ updatedAt: 0, fiveHour: window("", 10), sevenDay: null, models: [], plan: null, ...overrides });
  assert.equal(usageLineCount(EMPTY_USAGES), 0);
  assert.equal(usageLineCount({ claude: usage(), codex: null, readAt: 0 }), 1);
  assert.equal(usageLineCount({ claude: usage(), codex: usage({ source: "codex" }), readAt: 0 }), 2);
  assert.equal(hasUsageNumbers(usage({ fiveHour: null })), false, "an answer with only an error has no line");
  assert.equal(hasUsageNumbers(usage({ fiveHour: null, models: [window("Fable", 1)] })), true);
  assert.deepEqual(usageSourceLines(usage({ source: "codex" }), 60_000, zhCN).map((line) => line.text), ["1 分钟前更新 · 来自 Codex 会话记录"]);
  assert.deepEqual(usageSourceLines(usage(), 0, zhCN).map((line) => line.text), ["刚刚更新 · 来自 claude-hud"]);
});

test("a window past its reset time is not shown with the figure from before the reset", async () => {
  const { withoutPastWindows } = await import("../../src/features/agent-status/usage.ts");
  const now = 1_800_000_000_000;
  const usage = {
    updatedAt: now - 3 * 3_600_000,
    fiveHour: { name: "", used: 22, resetsAt: now - 60_000 },
    sevenDay: { name: "", used: 3, resetsAt: now + 86_400_000 },
    models: [{ name: "30d", used: 54, resetsAt: now - 1 }],
    plan: "Plus",
    source: "codex",
  };
  const shown = withoutPastWindows(usage, now);
  assert.equal(shown.fiveHour, null);
  assert.deepEqual(shown.sevenDay, usage.sevenDay);
  assert.deepEqual(shown.models, []);
  // Nothing past: the same object, so the island does not re-render for it.
  const current = { ...usage, fiveHour: { name: "", used: 4, resetsAt: now + 1 }, models: [] };
  assert.equal(withoutPastWindows(current, now), current);
  assert.equal(withoutPastWindows(null, now), null);
});
