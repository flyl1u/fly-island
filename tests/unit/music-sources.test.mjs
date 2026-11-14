import assert from "node:assert/strict";
import test from "node:test";
import { adoptedMediaState, excludedMusicSources, mergeMusicSources } from "../../src/features/media/musicSources.ts";
import { loadMusicSourcePriority, MUSIC_SOURCE_PRIORITY_STORAGE_KEY } from "../../src/features/media/storage.ts";
import { DEFAULT_MEDIA_STATE, isSameMediaState } from "../../src/features/media/mediaState.ts";

test("audio sources keep their exclusion and position when SMTC becomes available", () => {
  const current = [{ id: "audio:player", label: "Player", enabled: false }, { id: "other", label: "Other" }];
  const live = [{ id: "player.exe", label: "Player", playing: true, kind: "media", aliases: ["audio:player"] }];
  const merged = mergeMusicSources(current, live);
  assert.deepEqual(merged, [{ id: "player.exe", label: "Player", enabled: false, aliases: ["audio:player"] }, current[1]]);
  assert.deepEqual(excludedMusicSources(merged), ["player.exe", "audio:player"]);
  assert.equal(mergeMusicSources(merged, live), merged, "unchanged discovery does not trigger another save");
});

test("duplicate aliases retain an exclusion and disconnected sources keep their settings", () => {
  const current = [{ id: "player.exe", label: "Player" }, { id: "audio:player", label: "Player", enabled: false }];
  const live = [{ id: "player.exe", label: "Player", playing: false, aliases: ["audio:player"] }];
  const merged = mergeMusicSources(current, live);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].enabled, false);
  assert.equal(mergeMusicSources(merged, []), merged);
});

test("old data stays adopted and malformed optional fields cannot disable a source", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const stored = [{ id: "old", label: "Old" }, { id: "new", label: "New", enabled: false, aliases: ["alias", null, "", "alias"] },
    { id: "invalid", label: "Invalid", enabled: "false", aliases: "not an array" }];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key) => key === MUSIC_SOURCE_PRIORITY_STORAGE_KEY ? JSON.stringify(stored) : null,
  } } });
  try {
    assert.deepEqual(loadMusicSourcePriority(), [{ id: "old", label: "Old" },
      { id: "new", label: "New", enabled: false, aliases: ["alias"] }, { id: "invalid", label: "Invalid" }]);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else delete globalThis.window;
  }
});

test("mode, mute state and session capabilities participate in media state equality", () => {
  assert.equal(isSameMediaState(DEFAULT_MEDIA_STATE, { ...DEFAULT_MEDIA_STATE, controlMode: "audio" }), false);
  assert.equal(isSameMediaState(DEFAULT_MEDIA_STATE, { ...DEFAULT_MEDIA_STATE, audioMuted: true }), false);
  const state = { ...DEFAULT_MEDIA_STATE, sessions: [{ id: "app", label: "App", playing: true, kind: "audio" }] };
  assert.equal(isSameMediaState(state, { ...state, sessions: [{ ...state.sessions[0], kind: "media" }] }), false);
  assert.equal(isSameMediaState(state, { ...state, sessions: [{ ...state.sessions[0], aliases: ["old"] }] }), false);
});

test("a late read or command response cannot restore a source excluded meanwhile", () => {
  const state = { ...DEFAULT_MEDIA_STATE, available: true, title: "Private track", audioActive: true, audioPeak: 0.8,
    activeSessionId: "media.exe", sessions: [{ id: "media.exe", label: "Player", playing: true, aliases: ["audio:player"] }] };
  const filtered = adoptedMediaState(state, [{ id: "audio:player", label: "Player", enabled: false }]);
  assert.equal(filtered.title, null);
  assert.equal(filtered.audioActive, false);
  assert.equal(filtered.audioPeak, 0);
  assert.equal(filtered.resumeBlocked, true);
  assert.equal(filtered.sessions, state.sessions, "settings still discovers excluded sources");
  assert.equal(adoptedMediaState(state, []), state);
});
