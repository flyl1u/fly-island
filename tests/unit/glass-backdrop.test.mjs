import assert from "node:assert/strict";
import test from "node:test";
import { backdropPlacement } from "../../src/windows/island/glassBackdrop.ts";
import { clipboardItemKind, matchesKind } from "../../src/features/clipboard/kind.ts";

test("the wallpaper is shifted by the window's place on its monitor, in CSS px", () => {
  const monitor = { left: -1920, top: 0, width: 3840, height: 2160 };
  assert.deepEqual(backdropPlacement(monitor, { x: -1200, y: -30 }, 2), {
    "--glass-backdrop-x": "-360px",
    "--glass-backdrop-y": "15px",
    "--glass-backdrop-size": "1920px 1080px",
  });
  assert.equal(backdropPlacement(monitor, { x: -1920, y: 0 }, 0)["--glass-backdrop-size"], "3840px 2160px");
});

test("clipboard rows are text, image or files, and the type filter matches them", () => {
  assert.equal(clipboardItemKind({ kind: "text" }), "text");
  assert.equal(clipboardItemKind({ kind: "text", files: [] }), "text");
  assert.equal(clipboardItemKind({ kind: "text", files: ["C:/a.txt"] }), "file");
  assert.equal(clipboardItemKind({ kind: "image" }), "image");
  assert.equal(matchesKind({ kind: "image" }, "any"), true);
  assert.equal(matchesKind({ kind: "image" }, "text"), false);
});
