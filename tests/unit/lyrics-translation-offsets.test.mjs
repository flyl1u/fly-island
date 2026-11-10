import assert from "node:assert/strict";
import test from "node:test";
import { parseLrc, withTranslations } from "../../src/features/media/lyrics/lrc.ts";
import { MAX_SONG_OFFSETS, normalizeSongOffsets, setSongOffset } from "../../src/features/media/lyrics/songOffsets.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";

test("each line takes the translation that starts with it", () => {
  const lines = parseLrc("[00:17.51]Oh I believe\n[00:22.00]in yesterday\n[00:30.00]");
  const translated = withTranslations(lines, parseLrc("[00:17.52]哦 我相信\n[00:30.00]不该出现"));
  assert.deepEqual(translated, [
    { timeMs: 17_510, text: "Oh I believe", translation: "哦 我相信" },
    { timeMs: 22_000, text: "in yesterday" },
    { timeMs: 30_000, text: "" },
  ]);
  assert.equal(withTranslations(lines, []), lines);
});

test("per-song offsets are kept in range, and 0 or the oldest drop out", () => {
  let offsets = setSongOffset({}, "余香", 1500);
  offsets = setSongOffset(offsets, "晴天", -99_999);
  assert.deepEqual(offsets, { "余香": 1500, "晴天": -10_000 });
  assert.deepEqual(setSongOffset(offsets, "余香", 0), { "晴天": -10_000 });
  let many = {};
  for (let index = 0; index < MAX_SONG_OFFSETS + 3; index += 1) many = setSongOffset(many, String(index), 500);
  assert.equal(Object.keys(many).length, MAX_SONG_OFFSETS);
  assert.equal("0" in many, false);
  assert.deepEqual(normalizeSongOffsets({ a: 1234, b: "x", c: 0 }), { a: 1200 });
  assert.deepEqual(normalizeSongOffsets([1]), {});
});

test("Chinese lyric sources are on unless turned off", () => {
  assert.equal(normalizeSettings({}).lyricsChinese, true);
  assert.equal(normalizeSettings({ lyricsChinese: false }).lyricsChinese, false);
});
