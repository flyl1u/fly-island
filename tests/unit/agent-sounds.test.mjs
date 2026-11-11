import assert from "node:assert/strict";
import test from "node:test";
import { soundFor } from "../../src/features/agent-status/sounds/events.ts";
import { APPROVAL_REPEAT_MS, emptyAnnounced, isUsersTurn, settledFinishes, settledWaits } from "../../src/features/agent-status/announce.ts";
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
  // A reply that merely ends in a question mark is not a question to answer: only the marker says so.
  assert.equal(soundFor("running", "completed", { currentTool: null, replyAsks: true }), "complete");
  assert.equal(soundFor("running", "completed", { currentTool: null, replyMarker: "done", replyAsks: true }), "complete");
});

const turn = (phase, prompts = {}) => ({ provider: "claudeCode", sessionId: "s1", phase, turnStartedAt: 100, ownerPromptAt: 100, ...prompts });

test("a finished turn is announced once it stays finished, once per typed prompt", () => {
  const announced = emptyAnnounced();
  assert.deepEqual(settledFinishes([turn("completed")], [turn("running")], announced), [], "running again: a step, not the end");
  assert.equal(settledFinishes([turn("completed")], [turn("completed")], announced).length, 1);
  assert.deepEqual(settledFinishes([turn("completed")], [turn("completed")], announced), [], "the agent carried on by itself: same prompt stays quiet");
  // A background task's note or another session's report starts a new turn, but not a new typed prompt.
  const automatic = turn("completed", { turnStartedAt: 150 });
  assert.deepEqual(settledFinishes([automatic], [automatic], announced), [], "an automatic continuation stays quiet");
  const next = turn("completed", { turnStartedAt: 200, ownerPromptAt: 200 });
  assert.equal(settledFinishes([next], [next], announced).length, 1, "a new typed prompt is announced again");
  const unknown = turn("completed", { turnStartedAt: null, ownerPromptAt: null });
  assert.equal(settledFinishes([unknown], [unknown], announced).length, 1, "no prompt known at all: announced");
});

test("only the user's own turns are announced as finished", () => {
  assert.equal(isUsersTurn({ turnStartedAt: 100, ownerPromptAt: 100 }), true);
  assert.equal(isUsersTurn({ turnStartedAt: 100, ownerPromptAt: null }), false, "a side session nobody typed into");
  assert.equal(isUsersTurn({ turnStartedAt: null, ownerPromptAt: null }), true, "nothing known: as before");
  assert.equal(isUsersTurn({ turnStartedAt: 100 }), true, "an older build without the field");
  const side = turn("completed", { ownerPromptAt: null });
  assert.deepEqual(settledFinishes([side], [side], emptyAnnounced()), []);
});

test("a wait is announced once it lasts; a session's approvals at most every two minutes", () => {
  const wait = (phase, name = "Bash") => ({ provider: "claudeCode", sessionId: "s1", phase, currentTool: { name, detail: null } });
  const announced = emptyAnnounced();
  assert.deepEqual(settledWaits([wait("waiting")], [wait("running")], announced, 0), [], "approved by itself (auto mode): quiet");
  assert.equal(settledWaits([wait("waiting")], [wait("waiting")], announced, 1_000).length, 1);
  assert.deepEqual(settledWaits([wait("waiting")], [wait("waiting")], announced, 30_000), [], "the next tool call asking again is the same interruption");
  assert.equal(settledWaits([wait("waiting")], [wait("waiting")], announced, 1_000 + APPROVAL_REPEAT_MS).length, 1);
  // A question to answer always counts.
  const question = wait("waiting", "AskUserQuestion");
  assert.equal(settledWaits([question], [question], announced, 1_000 + APPROVAL_REPEAT_MS + 1).length, 1);
});

test("compacting and quota changes are quiet by default", () => {
  const { events } = DEFAULT_AGENT_SOUND_SETTINGS;
  assert.equal(events.compact || events.quotaLow || events.quotaReset, false);
  assert.equal(events.complete && events.approval && events.question, true);
});
