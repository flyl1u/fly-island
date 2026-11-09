import assert from "node:assert/strict";
import test from "node:test";
import { soundFor } from "../../src/features/agent-status/sounds/events.ts";
import { isQuietTime, parseClock } from "../../src/features/agent-status/sounds/quietHours.ts";
import { DEFAULT_AGENT_SOUND_SETTINGS, normalizeAgentSoundSettings } from "../../src/features/agent-status/sounds/storage.ts";

const tool = (name) => ({ currentTool: name ? { name, detail: null } : null });

test("session changes map to the sound for them", () => {
  assert.equal(soundFor(undefined, "running", tool()), "start");
  assert.equal(soundFor(undefined, "completed", tool()), null, "an old session coming into view is quiet");
  assert.equal(soundFor("running", "completed", tool()), "complete");
  assert.equal(soundFor("running", "failed", tool()), "error");
  assert.equal(soundFor("running", "waiting", tool("Bash")), "approval");
  assert.equal(soundFor("running", "waiting", tool("AskUserQuestion")), "question");
  assert.equal(soundFor("completed", "running", tool()), "ack");
  assert.equal(soundFor("running", "running", tool()), null);
  assert.equal(soundFor("waiting", "waiting", tool()), null);
});

test("quiet hours cover the range and may run past midnight", () => {
  assert.equal(parseClock("8:05"), 485);
  assert.equal(parseClock("24:00"), null);
  const at = (h, m) => new Date(2026, 10, 6, h, m);
  assert.equal(isQuietTime(at(23, 0), "22:00", "08:00"), true);
  assert.equal(isQuietTime(at(7, 59), "22:00", "08:00"), true);
  assert.equal(isQuietTime(at(8, 0), "22:00", "08:00"), false);
  assert.equal(isQuietTime(at(13, 0), "12:00", "14:00"), true);
  assert.equal(isQuietTime(at(13, 0), "12:00", "12:00"), false);
});

test("only the sound switch is read back; the rest stays at its default", () => {
  assert.deepEqual(normalizeAgentSoundSettings(undefined), DEFAULT_AGENT_SOUND_SETTINGS);
  const settings = normalizeAgentSoundSettings({ enabled: false, volume: 20, pack: "mine", events: { start: true }, quietHours: { enabled: true } });
  assert.deepEqual(settings, { ...DEFAULT_AGENT_SOUND_SETTINGS, enabled: false });
});

test("a finished turn sounds by its reply status marker", () => {
  const ended = (replyMarker) => ({ currentTool: null, replyMarker });
  assert.equal(soundFor("running", "completed", ended("yourTurn")), "question");
  assert.equal(soundFor("running", "completed", ended("background")), null);
  assert.equal(soundFor("running", "completed", ended("done")), "complete");
  assert.equal(soundFor("running", "completed", ended(undefined)), "complete");
  // Without a marker, a reply that asks something sounds as a question.
  assert.equal(soundFor("running", "completed", { currentTool: null, replyAsks: true }), "question");
  assert.equal(soundFor("running", "completed", { currentTool: null, replyMarker: "done", replyAsks: true }), "complete");
});
