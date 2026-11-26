import assert from "node:assert/strict";
import test from "node:test";
import { collapsedChromeWidth, collapsedTextWidth, collapsedWidthTarget } from "../../src/windows/island/collapsedWidth.ts";
import { AUTO_WIDTH_DEFAULT } from "../../src/windows/island/layout.ts";
import { getNoticeSize } from "../../src/windows/island/noticeLayout.ts";

// The reported island: side space 15, the status light (23 wide, -7 each side), the waveform
// button and the weather, with the bar's 8px gaps. The clock is about as wide as measured here.
const LIGHT = 9, WAVE = 28, WEATHER = 41, CLOCK = 38;
const bar = (status, padding = 30) => collapsedChromeWidth({ status, gap: 8, padding });
const reading = {
  manual: 340, range: { min: 160, max: 280 }, content: { text: "阅读", extraWidth: 0 },
  preview: null, fontScale: 1, chrome: bar([LIGHT, WAVE, WEATHER]),
  // At 200% every whole width starts on a device pixel, so alignment changes nothing here.
  stageWidth: 1100, devicePixelRatio: 2,
};
const width = (overrides = {}) => collapsedWidthTarget({ ...reading, ...overrides });

test("a two-character todo with the waveform and weather lands on the lower limit of 160", () => {
  assert.equal(width(), 160);
  // The canvas measurement of two 13px CJK glyphs gives the same.
  assert.equal(width({ measure: () => 26 }), 160);
  // Empty text keeps the same room, so the island does not shrink below what a short title needs.
  assert.equal(width({ content: { text: "", extraWidth: 0 } }), 160);
});

test("pixel alignment stays within the limits and never cuts into the text", () => {
  const range = { min: 160, max: 480 };
  for (const devicePixelRatio of [1, 1.25, 1.5, 1.75, 2]) {
    const short = width({ range, devicePixelRatio });
    assert.ok(short >= 160 && short <= 164, `${devicePixelRatio}: ${short}`);
    for (let count = 3; count < 40; count++) {
      const content = { text: "字".repeat(count), extraWidth: 0 };
      const exact = width({ range, content });
      const aligned = width({ range, content, devicePixelRatio });
      assert.ok(aligned >= exact - 2 && aligned <= exact + 8 && aligned >= 160 && aligned <= 480,
        `${count} at ${devicePixelRatio}: ${exact} -> ${aligned}`);
    }
  }
});

test("the result is the width before the island scale, so every scale draws the same floor", () => {
  // The island scale is a transform on the island: it is not an input, 160 stays 160.
  for (const scale of [0.92, 1, 1.2]) assert.equal(Math.round(width() * scale * 100) / 100, Math.round(160 * scale * 100) / 100);
});

test("a larger island font only widens the island when the text no longer fits", () => {
  const range = { min: 220, max: 480 };
  for (const fontScale of [0.92, 1, 1.2]) assert.equal(width({ range, fontScale }), 220);
  const content = { text: "字".repeat(10), extraWidth: 0 };
  const at = (fontScale) => width({ range, fontScale, content });
  assert.ok(at(0.92) < at(1) && at(1) < at(1.2), `${at(0.92)} ${at(1)} ${at(1.2)}`);
});

test("the width grows with the text from the lower limit to the upper one", () => {
  const at = (count) => width({ content: { text: "字".repeat(count), extraWidth: 0 } });
  const widths = Array.from({ length: 30 }, (_, count) => at(count));
  assert.equal(widths[2], 160);
  assert.equal(widths.at(-1), 280);
  assert.ok(widths.every((value, index) => index === 0 || (value >= widths[index - 1] && value - widths[index - 1] <= 13)), String(widths));
  assert.ok(widths.some((value) => value > 160 && value < 280));
  assert.ok(widths.every(Number.isInteger));
});

test("turning the clock, weather and waveform on or off changes the width by their own sizes", () => {
  // Well above the lower limit, so every difference shows.
  const content = { text: "字".repeat(10), extraWidth: 0 };
  const range = { min: 160, max: 720 };
  const at = (status) => width({ content, range, chrome: bar(status) });
  const none = at([LIGHT]);
  assert.equal(none, 30 + LIGHT + 8 + 130 + 2);
  assert.equal(at([LIGHT, WAVE]) - none, WAVE + 8);
  assert.equal(at([LIGHT, WEATHER]) - none, WEATHER + 8);
  assert.equal(at([LIGHT, CLOCK]) - none, CLOCK + 8);
  assert.equal(at([LIGHT, WAVE, CLOCK, WEATHER]) - none, WAVE + CLOCK + WEATHER + 24);
});

test("the side space, extras and an inline update dot add exactly their own width", () => {
  const content = { text: "字".repeat(10), extraWidth: 0 };
  const range = { min: 160, max: 720 };
  const base = width({ content, range });
  assert.equal(width({ content, range, chrome: bar([LIGHT, WAVE, WEATHER], 40) }) - base, 10);
  assert.equal(width({ content, range, chrome: bar([LIGHT, WAVE, WEATHER], 20) }) - base, -10);
  assert.equal(width({ content: { ...content, extraWidth: 30 }, range }) - base, 30);
  assert.equal(width({ content: { ...content, extraWidth: -10 }, range }), base);
  assert.equal(collapsedChromeWidth({ status: [], gap: 8, padding: 36, textExtras: 15 }), 51);
});

test("measured text wins over the estimate, except for the lyric line's fixed room", () => {
  const measure = (text, role) => text.length * (role === "brand" ? 10 : 5);
  assert.equal(collapsedTextWidth({ text: "abcd", extraWidth: 0 }, 1, measure), 20);
  // The title text, the spacing, then "· " and the current item.
  assert.equal(collapsedTextWidth({ text: "abcd", brand: "ab", extraWidth: 0 }, 1, measure), 20 + 8 + 30);
  assert.equal(collapsedTextWidth({ text: "", brand: "ab", extraWidth: 0 }, 1, measure), 20);
  // Nothing measured (no canvas): about 13px per CJK glyph.
  assert.equal(collapsedTextWidth({ text: "阅读", extraWidth: 0 }, 1, () => 0), 26);
  const lyric = { text: "♪".repeat(24), extraWidth: 0, fixedText: true };
  assert.equal(collapsedTextWidth(lyric, 1, measure), collapsedTextWidth(lyric, 1));
});

test("a collapsed message replaces the underlying summary as the automatic width target", () => {
  const range = { min: 200, max: 480 };
  const preview = { text: "群聊 · 这条消息比待办事项长得多", extraWidth: 30 };
  assert.equal(width({ range }), 200);
  assert.ok(width({ range, preview }) > 200 && width({ range, preview }) < 480);
  assert.equal(width({ range, preview: null }), 200);
  assert.equal(width({ range: null, preview }), 340);
});

test("short and long previews clamp to the configured ends, even with visible status slots", () => {
  const range = { min: 200, max: 480 };
  assert.equal(width({ range, preview: { text: "hi", extraWidth: 30 } }), 200);
  assert.equal(width({ range, preview: { text: "字".repeat(100), extraWidth: 30 } }), 480);
});

test("a visible title and the current item both count; a preview replaces both", () => {
  const range = { min: 200, max: 480 };
  const content = { text: "正在处理的任务", brand: "工作中的 Fly Island", extraWidth: 0 };
  assert.ok(width({ range, content }) > width({ range, content: { ...content, brand: null } }));
  assert.equal(width({ range, content, preview: { text: "Hi", extraWidth: 30 } }), 200);
});

test("the default limits and a wider range bound the automatic width", () => {
  const range = { ...AUTO_WIDTH_DEFAULT };
  assert.equal(width({ range, content: { text: "", extraWidth: 0 } }), AUTO_WIDTH_DEFAULT.min);
  assert.equal(width({ range, content: { text: "x".repeat(200), extraWidth: 0 } }), AUTO_WIDTH_DEFAULT.max);
  assert.equal(width({ range: { min: 160, max: 720 }, content: { text: "abcdefg", extraWidth: 1000 } }), 720);
});

test("adaptive reader may wrap and scroll within the automatic width range", () => {
  const options = { minWidth: 180, maxWidth: 240, maxHeight: 100, baseWidth: 180, baseHeight: 38, fontScale: 1, collapsedScale: 1, forceReader: true };
  assert.equal(getNoticeSize({ sender: "Name", body: "Hi" }, options).width, 180);
  const long = getNoticeSize({ sender: "Name", body: "字".repeat(200) }, options);
  assert.ok(long.reader && long.scrolls && long.width <= 240 && long.width >= 180);
});
