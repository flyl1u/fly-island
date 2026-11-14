import assert from "node:assert/strict";
import test from "node:test";
import { lyricClockAt } from "../../src/features/media/lyrics/lyricClock.ts";
import { parseLrc, songOffsetKey, trackKey } from "../../src/features/media/lyrics/lrc.ts";

const lines = parseLrc("[00:01.00]first\n[00:05.00]second\n[00:09.00]third");
const state = { positionMs: 0, durationMs: 60_000, updatedAt: 1000, playbackStatus: "playing" };

test("collapsing after time passed in the expanded island selects the current line", () => {
  assert.equal(lyricClockAt(lines, state, 1000, 0).index, -1);
  assert.deepEqual(lyricClockAt(lines, state, 7100, 0), {
    index: 1, position: 6100, playing: true, wait: 2700,
  });
});

test("late lyrics use elapsed playback, preserving the lead and song offset", () => {
  assert.equal(lyricClockAt(null, state, 1000, 0).index, -1);
  assert.equal(lyricClockAt(lines, state, 9800, 0).index, 2);
  assert.equal(lyricClockAt(lines, state, 9800, 500).index, 1);
  assert.equal(lyricClockAt(lines, { ...state, playbackStatus: "paused", positionMs: 5100 }, 9800, 0).index, 1);
});

test("zero duration becoming known keeps the lookup key and preserves legacy offset keys", () => {
  const song = { title: "晴天", artist: "周杰伦", durationMs: 0 };
  assert.equal(trackKey(song), trackKey({ ...song, durationMs: 269_000 }));
  assert.equal(songOffsetKey({ ...song, durationMs: 269_000 }), "晴天\u001f周杰伦\u001f135");
  assert.notEqual(trackKey(song), trackKey({ ...song, title: "夜曲" }));
});
