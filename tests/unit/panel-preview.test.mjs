import assert from "node:assert/strict";
import test from "node:test";
import { parsePanelPreview, PREVIEW_IDLE_MS } from "../../src/windows/settings/panelPreview.ts";
import { previewTarget, shouldRestorePreview } from "../../src/windows/island/panelPreviewPlan.ts";
import { appearancePreviewMode } from "../../src/windows/settings/appearancePreview.ts";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings.ts";

const original = { mode: "expanded", page: "todo", isTucked: false, retractsAfterPeek: true, peekRetractDelayMs: 500 };
const idle = { hovering: false, interacted: false, blocked: false };

test("appearance controls preview their affected shape, with no requests for unchanged or behavioral data", () => {
  for (const patch of [{ topEdgeShoulders: true }, { topEdgeShoulderSize: 20 }, { opacity: 80 }, { pulseColor: "#123456" }, { collapsedLayout: [...DEFAULT_SETTINGS.collapsedLayout].reverse() }]) {
    assert.equal(appearancePreviewMode(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ...patch }), "collapsed");
  }
  for (const patch of [{ islandFontPercent: 110 }, { expandedScale: 1.2 }, { pageButtonStyle: "capsule" }, { fontFamily: "pixel" }]) {
    assert.equal(appearancePreviewMode(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, ...patch }), "expanded");
  }
  assert.equal(appearancePreviewMode(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, collapsedLayout: [...DEFAULT_SETTINGS.collapsedLayout] }), null);
  assert.equal(appearancePreviewMode(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, autoTuck: false }), null);
});

test("old and new preview messages only count while fresh", () => {
  for (const mode of ["expanded", "collapsed", "tucked"]) {
    for (const age of [0, 1, 1999]) {
      assert.equal(parsePanelPreview(JSON.stringify({ mode, requestedAt: 10000 - age }), 10000), mode);
    }
    for (const age of [-1, 2000, 5000]) {
      assert.equal(parsePanelPreview(JSON.stringify({ mode, requestedAt: 10000 - age }), 10000), null);
    }
  }
  for (const value of [null, "null", "[]", '"expanded"', "{bad", '{"mode":"tucked"}', '{"mode":"other","requestedAt":10000}']) {
    assert.equal(parsePanelPreview(value, 10000), null);
  }
  assert.equal(PREVIEW_IDLE_MS, 2500);
});

test("preview target never changes the saved page or mutates the starting state", () => {
  for (const mode of ["expanded", "collapsed", "tucked"]) {
    const target = previewTarget(mode, original);
    assert.equal(target.page, "todo");
    assert.equal(target.mode, mode === "expanded" ? "expanded" : "collapsed");
    assert.equal(target.isTucked, mode === "tucked");
    assert.equal(target.retractsAfterPeek, false);
  }
  assert.equal(original.mode, "expanded");
  assert.equal(original.retractsAfterPeek, true);
});

test("restore only while idle, unblocked and still in the preview target", () => {
  const target = previewTarget("tucked", original);
  assert.equal(shouldRestorePreview(target, target, idle), true);
  for (const key of Object.keys(idle)) {
    assert.equal(shouldRestorePreview(target, target, { ...idle, [key]: true }), false);
  }
  for (const patch of [{ page: "music" }, { isTucked: false }, { mode: "expanded" }]) {
    assert.equal(shouldRestorePreview(target, { ...target, ...patch }, idle), false);
  }
});
