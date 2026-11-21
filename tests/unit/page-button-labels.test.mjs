import assert from "node:assert/strict";
import test from "node:test";
import { getPageButtonLabelWidths, resolvePageButtonLabelMode } from "../../src/features/appearance/pageButtonLabels.ts";

const widths = { all: 466, spacing: 434, gap: 412, font: 390, current: 190 };

test("labels go through spacing, icon gap and font compression before hiding", () => {
  assert.equal(resolvePageButtonLabelMode(466, widths, null), "all");
  assert.equal(resolvePageButtonLabelMode(465.9, widths, "all"), "spacing");
  assert.equal(resolvePageButtonLabelMode(434, widths, "spacing"), "spacing");
  assert.equal(resolvePageButtonLabelMode(433.9, widths, "spacing"), "gap");
  assert.equal(resolvePageButtonLabelMode(411.9, widths, "gap"), "font");
  assert.equal(resolvePageButtonLabelMode(390, widths, "font"), "font");
  assert.equal(resolvePageButtonLabelMode(389.9, widths, "font"), "current");
  assert.equal(resolvePageButtonLabelMode(190, widths, "current"), "current");
  assert.equal(resolvePageButtonLabelMode(189.9, widths, "current"), "icons");
});

test("each less compressed layout needs spare room before taking over", () => {
  assert.equal(resolvePageButtonLabelMode(191.9, widths, "icons"), "icons");
  assert.equal(resolvePageButtonLabelMode(192, widths, "icons"), "current");
  assert.equal(resolvePageButtonLabelMode(391.9, widths, "current"), "current");
  assert.equal(resolvePageButtonLabelMode(392, widths, "current"), "font");
  assert.equal(resolvePageButtonLabelMode(413.9, widths, "font"), "font");
  assert.equal(resolvePageButtonLabelMode(414, widths, "font"), "gap");
  assert.equal(resolvePageButtonLabelMode(436, widths, "gap"), "spacing");
  assert.equal(resolvePageButtonLabelMode(467.9, widths, "spacing"), "spacing");
  assert.equal(resolvePageButtonLabelMode(468, widths, "icons"), "all");
  assert.equal(resolvePageButtonLabelMode(391, widths, "current", 0.5), "font");
});

test("widths include fixed items, the right number of gaps and the current label", () => {
  const buttons = [
    { page: "agents", iconWidth: 16, fullTextWidth: 48, smallTextWidth: 44 },
    { page: "todo", iconWidth: 16, fullTextWidth: 24, smallTextWidth: 22 },
    { page: "qq", iconWidth: 16, fullTextWidth: 28, smallTextWidth: 25 },
  ];
  const measured = getPageButtonLabelWidths(buttons, [10], "todo", 1);
  assert.deepEqual(measured, { all: 206, spacing: 185, gap: 170, font: 161, current: 90 });
  assert.equal(getPageButtonLabelWidths(buttons, [10], "agents", 1).current, 112);
  const withoutCurrent = getPageButtonLabelWidths(buttons, [10], "settings", 1);
  assert.equal(resolvePageButtonLabelMode(160, withoutCurrent, null), "icons");
  assert.equal(resolvePageButtonLabelMode(161, withoutCurrent, null), "font");
});
