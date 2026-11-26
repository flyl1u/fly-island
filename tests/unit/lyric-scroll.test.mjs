import assert from "node:assert/strict";
import test from "node:test";
import {
  LYRIC_FADE_PX, LYRIC_SCROLL_PAUSE_MS, LYRIC_SCROLL_SPEED, LYRIC_SCROLL_TAIL_MS, LYRIC_WORD_ANCHOR,
  lyricScrollFrames, lyricScrollOffsetAt, planLyricScroll, planLyricWordScroll,
} from "../../src/features/media/lyrics/lyricScroll.ts";
import { playbackPosition } from "../../src/features/media/lyrics/lrc.ts";

test("a line that fits does not scroll", () => {
  assert.equal(planLyricScroll({ distance: 0, shownAtMs: 1000, goneAtMs: 5000 }), null);
  assert.equal(planLyricScroll({ distance: -20, shownAtMs: 1000, goneAtMs: 5000 }), null);
  assert.equal(planLyricWordScroll({ words: [{ startMs: 0, endMs: 100, left: 0, width: 50 }], distance: 0, view: 100 }), null);
});

test("a long line rests, then moves evenly and shows its end shortly before the next line", () => {
  const plan = planLyricScroll({ distance: 120, shownAtMs: 10_000, goneAtMs: 14_000 });
  const start = 10_000 + LYRIC_SCROLL_PAUSE_MS;
  const end = 14_000 - LYRIC_SCROLL_TAIL_MS;
  assert.deepEqual(plan, [{ atMs: start, offset: 0 }, { atMs: end, offset: 120 }]);
  // Before it is shown, through the rest, and at its very start.
  for (const at of [9_000, 10_000, start]) assert.equal(lyricScrollOffsetAt(plan, at), 0);
  assert.equal(lyricScrollOffsetAt(plan, (start + end) / 2), 60);
  assert.equal(lyricScrollOffsetAt(plan, start + (end - start) / 4), 30);
  for (const at of [end, 14_000, 99_000]) assert.equal(lyricScrollOffsetAt(plan, at), 120);
});

test("a short line, and the last line, move at the fixed speed and stop at the end", () => {
  for (const goneAtMs of [11_000, null]) {
    const plan = planLyricScroll({ distance: 80, shownAtMs: 10_000, goneAtMs });
    assert.deepEqual(plan.at(-1), { atMs: 10_000 + LYRIC_SCROLL_PAUSE_MS + (80 / LYRIC_SCROLL_SPEED) * 1000, offset: 80 });
    assert.equal(lyricScrollOffsetAt(plan, 10_000 + LYRIC_SCROLL_PAUSE_MS + 1000), LYRIC_SCROLL_SPEED);
    assert.equal(lyricScrollOffsetAt(plan, 60_000), 80);
  }
});

test("pausing holds the offset, resuming goes on from it, and seeking recomputes it", () => {
  const plan = planLyricScroll({ distance: 100, shownAtMs: 0, goneAtMs: 5000 });
  const state = (playbackStatus, positionMs, updatedAt) => ({ playbackStatus, positionMs, updatedAt, durationMs: 60_000 });
  const at = (media, now) => lyricScrollOffsetAt(plan, playbackPosition(media, now));
  const paused = state("paused", 2000, 100_000);
  assert.equal(at(paused, 100_000), at(paused, 130_000));
  const resumed = state("playing", 2000, 130_000);
  assert.equal(at(resumed, 130_000), at(paused, 130_000));
  assert.ok(at(resumed, 131_000) > at(resumed, 130_000));
  assert.equal(at(state("playing", 300, 200_000), 200_000), 0);
  assert.equal(at(state("playing", 4900, 200_000), 200_000), 100);
});

test("with word timing the sung edge stays in view, middle-right once the line moves", () => {
  const view = 100;
  // Six words of 40px: a 240px line in a 100px view, with a held word and a pause between two.
  const times = [[1000, 1400], [1400, 1900], [1900, 3900], [4500, 4800], [4800, 5100], [5100, 5100]];
  const words = times.map(([startMs, endMs], index) => ({ startMs, endMs, left: index * 40, width: 40 }));
  const distance = 240 - view;
  const plan = planLyricWordScroll({ words, distance, view });
  assert.ok(plan.every((point, index) => index === 0
    || (point.atMs >= plan[index - 1].atMs && point.offset >= plan[index - 1].offset)), JSON.stringify(plan));
  const sungEdge = (at) => words.reduce((edge, word) => {
    if (at < word.startMs) return edge;
    const length = word.endMs > word.startMs ? word.endMs - word.startMs : 400;
    return word.left + word.width * Math.min(1, (at - word.startMs) / length);
  }, 0);
  for (let at = 500; at <= 6000; at += 10) {
    const offset = lyricScrollOffsetAt(plan, at);
    const inView = sungEdge(at) - offset;
    assert.ok(offset >= 0 && offset <= distance, `${at}: ${offset}`);
    assert.ok(inView >= -0.01 && inView <= view + 0.01, `${at}: edge at ${inView}`);
    if (offset > 0.01 && offset < distance - 0.01) assert.ok(Math.abs(inView - view * LYRIC_WORD_ANCHOR) < 0.01, `${at}: ${inView}`);
  }
  assert.equal(lyricScrollOffsetAt(plan, 1000), 0);
  assert.equal(lyricScrollOffsetAt(plan, 6000), distance);
});

test("animation frames start when the line is shown, and an edge fades only where text is hidden", () => {
  const plan = planLyricScroll({ distance: 120, shownAtMs: 10_000, goneAtMs: 14_000 });
  const { startMs, durationMs, frames } = lyricScrollFrames(plan, 120, 10_000);
  assert.equal(startMs, 10_000);
  assert.equal(durationMs, 14_000 - LYRIC_SCROLL_TAIL_MS - 10_000);
  assert.equal(frames[0].at, 0);
  assert.equal(frames.at(-1).at, 1);
  assert.deepEqual(frames.map((frame) => [frame.offset, frame.fadeStart, frame.fadeEnd]),
    [[0, 0, 10], [0, 0, 10], [LYRIC_FADE_PX, 10, 10], [110, 10, 10], [120, 10, 0]]);
  // Each frame sits on the planned path.
  for (const frame of frames) {
    assert.ok(Math.abs(lyricScrollOffsetAt(plan, startMs + frame.at * durationMs) - frame.offset) < 0.001);
  }
  // A line shorter than two fades still ends sharp.
  const short = lyricScrollFrames(planLyricScroll({ distance: 6, shownAtMs: 0, goneAtMs: 3000 }), 6, 0).frames;
  assert.deepEqual([short[0].fadeStart, short.at(-1).fadeEnd], [0, 0]);
});
