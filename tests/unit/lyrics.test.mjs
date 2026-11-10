import assert from "node:assert/strict";
import test from "node:test";
import { lineIndexAt, parseLrc, playbackPosition, trackKey, wordFill } from "../../src/features/media/lyrics/lrc.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";
import { suggestsChineseSources } from "../../src/features/media/lyrics/chineseHint.ts";

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

test("lyrics are looked up online unless turned off; the folder and global offset are no longer read back", () => {
  const settings = normalizeSettings({});
  assert.equal(settings.lyricsOnline, true);
  assert.equal(normalizeSettings({ lyricsOnline: false }).lyricsOnline, false);
  assert.equal(settings.lyricsFolder, "");
  assert.equal(normalizeSettings({ lyricsOnline: true, lyricsChinese: true }).lyricsChinese, true);
  assert.equal(normalizeSettings({ lyricsOffsetMs: -1200 }).lyricsOffsetMs, 0);
  assert.equal(normalizeSettings({ lyricsFolder: " D:\\Lyrics " }).lyricsFolder, "");
});

test("enhanced LRC word times become the line's words", () => {
  const parse = parseLrc;
  const [line] = parse("[00:17.51]<00:17.51>Oh <00:17.80>I <00:18.21>believe<00:19.75>");
  assert.equal(line.text, "Oh I believe");
  assert.deepEqual(line.words, [
    { startMs: 17_510, endMs: 17_800, text: "Oh " },
    { startMs: 17_800, endMs: 18_210, text: "I " },
    { startMs: 18_210, endMs: 19_750, text: "believe" },
  ]);
  // Text before the first word time starts with the line; plain lines have no words.
  assert.deepEqual(parse("[00:01.00]啊 <00:01.50>哦<00:02.00>")[0].words?.map((word) => [word.startMs, word.text]), [[1000, "啊 "], [1500, "哦"]]);
  assert.equal(parse("[00:01.00]plain")[0].words, undefined);
  assert.equal(parse("[00:01.00]<00:01.00><00:02.00>")[0].words, undefined);
  // The offset tag moves the words too; a repeated line keeps its words' spacing.
  const repeated = parse("[offset:+100]\n[00:01.00][00:10.00]<00:01.00>a<00:01.50>b<00:02.00>");
  assert.deepEqual(repeated.map((l) => l.words?.map((word) => word.startMs)), [[900, 1400], [9900, 10_400]]);
  // Angle brackets that are not times stay text.
  assert.equal(parse("[00:01.00]a <b> c")[0].text, "a <b> c");
  assert.deepEqual(wordFill({ startMs: 1000, endMs: 1400, text: "x" }, 1100), { delayMs: -100, durationMs: 400 });
  assert.deepEqual(wordFill({ startMs: 2000, endMs: 2000, text: "x" }, 1000), { delayMs: 1000, durationMs: 1 });
});

test("a Chinese song with no lyrics from LRCLIB suggests Kugou and NetEase", () => {
  const song = { title: "不找了", artist: "隔壁老樊" };
  const lrclibOnly = { lyricsOnline: true, lyricsChinese: false };
  assert.equal(suggestsChineseSources(song, lrclibOnly, true), true);
  // Found or still looking, already asking them, offline on purpose, or not a Chinese name: no hint.
  assert.equal(suggestsChineseSources(song, lrclibOnly, false), false);
  assert.equal(suggestsChineseSources(song, { lyricsOnline: true, lyricsChinese: true }, true), false);
  assert.equal(suggestsChineseSources(song, { lyricsOnline: false }, true), false);
  assert.equal(suggestsChineseSources({ title: "Yesterday", artist: "The Beatles" }, lrclibOnly, true), false);
  assert.equal(suggestsChineseSources({ title: "Song", artist: "周杰伦" }, lrclibOnly, true), true);
});

test("track times read m:ss, and h:mm:ss past an hour", async () => {
  const { formatTrackTime } = await import("../../src/features/media/trackTime.ts");
  assert.equal(formatTrackTime(0), "0:00");
  assert.equal(formatTrackTime(6_900), "0:06");
  assert.equal(formatTrackTime(269_000), "4:29");
  assert.equal(formatTrackTime(3_725_000), "1:02:05");
  assert.equal(formatTrackTime(-500), "0:00");
});
