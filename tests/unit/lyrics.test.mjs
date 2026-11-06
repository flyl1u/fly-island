import assert from "node:assert/strict";
import test from "node:test";
import { lineIndexAt, parseLrc, playbackPosition, trackKey } from "../../src/features/media/lyrics/lrc.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

test("LRC lines are parsed, sorted and shifted by the offset tag", () => {
  const lines = parseLrc(
    "[ti:晴天]\n[ar:周杰伦]\n[offset:+500]\n[00:20.50]故事的小黄花\n[00:10.5][01:00.123]副歌\n[00:30.00]\n纯文本行",
  );
  assert.deepEqual(lines, [
    { timeMs: 10_000, text: "副歌" },
    { timeMs: 20_000, text: "故事的小黄花" },
    { timeMs: 29_500, text: "" },
    { timeMs: 59_623, text: "副歌" },
  ]);
  assert.deepEqual(parseLrc("\uFEFF[00:01.00]a\r\n[00:02.00]b").map((line) => line.text), ["a", "b"]);
  assert.deepEqual(parseLrc("no tags at all"), []);
});

test("the line being sung is the last one that started", () => {
  const lines = parseLrc("[00:01.00]a\n[00:02.00]b\n[00:03.00]c");
  assert.equal(lineIndexAt(lines, 500), -1);
  assert.equal(lineIndexAt(lines, 1000), 0);
  assert.equal(lineIndexAt(lines, 2999), 1);
  assert.equal(lineIndexAt(lines, 99_000), 2);
  assert.equal(lineIndexAt([], 1000), -1);
});

test("the position moves on from Windows' reading only while playing", () => {
  const state = { positionMs: 10_000, durationMs: 11_000, updatedAt: 1000, playbackStatus: "playing" };
  assert.equal(playbackPosition(state, 1500), 10_500);
  assert.equal(playbackPosition(state, 9000), 11_000);
  assert.equal(playbackPosition({ ...state, playbackStatus: "paused" }, 9000), 10_000);
});

test("a track is looked up once, whatever small differences in its reported length", () => {
  assert.equal(trackKey({ title: "晴天", artist: "周杰伦", durationMs: 269_000 }), trackKey({ title: "晴天", artist: "周杰伦", durationMs: 269_400 }));
  assert.equal(trackKey({ title: null, artist: null, durationMs: 0 }), null);
});

test("lyrics settings start offline and keep the offset in range", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.lyricsOnline, false);
  assert.equal(settings.lyricsFolder, "");
  assert.equal(normalizeSettings({ lyricsOffsetMs: 9000 }).lyricsOffsetMs, 3000);
  assert.equal(normalizeSettings({ lyricsOffsetMs: -1234 }).lyricsOffsetMs, -1200);
  assert.equal(normalizeSettings({ lyricsFolder: " D:\\Lyrics " }).lyricsFolder, "D:\\Lyrics");
});
