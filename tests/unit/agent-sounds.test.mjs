import assert from "node:assert/strict";
import test from "node:test";
import { soundFor } from "../../src/features/agent-status/sounds/events.ts";
import { planSoundPack } from "../../src/features/agent-status/sounds/packManifest.ts";
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

test("sound settings fall back field by field", () => {
  assert.deepEqual(normalizeAgentSoundSettings(undefined), DEFAULT_AGENT_SOUND_SETTINGS);
  const settings = normalizeAgentSoundSettings({ volume: 250, pack: "../x", events: { start: true }, quietHours: { start: "nope" } });
  assert.equal(settings.volume, 100);
  assert.equal(settings.pack, "builtin");
  assert.equal(settings.events.start, true);
  assert.equal(settings.events.complete, true);
  assert.equal(settings.quietHours.start, "22:00");
});

test("a fly-island manifest names the pack and its files", () => {
  const plan = planSoundPack("folder", ["folder/done.wav", "folder/oops.wav", "folder/focusd-sound-pack.json"], [{
    path: "folder/focusd-sound-pack.json",
    text: JSON.stringify({ name: "Chimes", author: "Ann", license: "CC0-1.0", sounds: { complete: "done.wav", "task.error": "oops.wav" } }),
  }]);
  assert.deepEqual(plan, { name: "Chimes", author: "Ann", license: "CC0-1.0", sounds: { complete: "folder/done.wav", error: "folder/oops.wav" } });
});

test("a CESP-style list maps categories, and approval doubles as question", () => {
  const files = ["rec/01-session-start.wav", "rec/04-input-required.wav", "rec/07-idle-reminder.wav", "rec/manifest.json"];
  const plan = planSoundPack("rec", files, [{
    path: "rec/manifest.json",
    text: JSON.stringify([
      { file: "01-session-start.wav", cesp_category: "session.start" },
      { file: "04-input-required.wav", cesp_category: "input.required" },
      { file: "07-idle-reminder.wav", cesp_category: "idle.reminder" },
    ]),
  }]);
  assert.equal(plan.name, "rec");
  assert.deepEqual(plan.sounds, {
    start: "rec/01-session-start.wav",
    approval: "rec/04-input-required.wav",
    question: "rec/04-input-required.wav",
    idle: "rec/07-idle-reminder.wav",
  });
});

test("without a manifest, file names give the events; a folder without sounds is refused", () => {
  const plan = planSoundPack("p", ["p/Task_Complete.mp3", "p/error.ogg", "p/readme.txt"], []);
  assert.deepEqual(plan.sounds, { complete: "p/Task_Complete.mp3", error: "p/error.ogg" });
  assert.equal(planSoundPack("p", ["p/readme.txt", "p/song.wav"], []), "noSounds");
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
