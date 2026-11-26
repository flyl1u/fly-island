import assert from "node:assert/strict";
import test from "node:test";
import { collapsedWidthTarget } from "../../src/windows/island/collapsedWidth.ts";
import { getNoticeSize } from "../../src/windows/island/noticeLayout.ts";

const inputs = {
  manual: 340, range: { min: 200, max: 480 }, content: { text: "Todo", extraWidth: 0 },
  preview: null, fontScale: 1, paddingExtra: 0, clock: false, weather: false, statusMinimum: 0,
  stageWidth: 1100, devicePixelRatio: 1,
};
const width = (overrides = {}) => collapsedWidthTarget({ ...inputs, ...overrides });

test("a collapsed message replaces the underlying summary as the automatic width target", () => {
  const preview = { text: "群聊 · ".concat("这条消息比待办事项长得多".repeat(2)), extraWidth: 23 };
  assert.equal(width(), 200);
  assert.ok(width({ preview }) > 200 && width({ preview }) < 480);
  assert.equal(width({ preview: null }), 200);
  assert.equal(width({ preview, range: null }), 340);
});

test("short and long previews clamp to the configured ends, even with visible status slots", () => {
  assert.equal(width({ preview: { text: "hi", extraWidth: 23 } }), 200);
  assert.equal(width({ preview: { text: "字".repeat(100), extraWidth: 23 }, clock: true, weather: true }), 480);
  assert.ok(width({ clock: true }) > width());
  assert.equal(width({ statusMinimum: 248 }), 248);
});

test("a visible title and the current item both count; a preview replaces both", () => {
  const content = { text: "正在处理的任务", brand: "工作中的 Fly Island", extraWidth: 0 };
  assert.ok(width({ content }) > width({ content: { ...content, brand: null } }));
  assert.equal(width({ content, preview: { text: "Hi", extraWidth: 23 } }), 200);
});

test("adaptive reader may wrap and scroll within the automatic width range", () => {
  const options = { minWidth: 180, maxWidth: 240, maxHeight: 100, baseWidth: 180, baseHeight: 38, fontScale: 1, collapsedScale: 1, forceReader: true };
  assert.equal(getNoticeSize({ sender: "Name", body: "Hi" }, options).width, 180);
  const long = getNoticeSize({ sender: "Name", body: "字".repeat(200) }, options);
  assert.ok(long.reader && long.scrolls && long.width <= 240 && long.width >= 180);
});
