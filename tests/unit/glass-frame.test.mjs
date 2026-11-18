import assert from "node:assert/strict";
import test from "node:test";
import { glassFramePlacement, parseGlassFrame } from "../../src/windows/island/glassFrame.ts";
import { clipboardItemKind, matchesKind } from "../../src/features/clipboard/kind.ts";

test("a live backdrop frame carries its place on the window and its RGBA pixels", () => {
  const bytes = new Uint8Array(24 + 2 * 1 * 4);
  const view = new DataView(bytes.buffer);
  [-20, 0, 1180, 460].forEach((value, index) => view.setInt32(index * 4, value, true));
  view.setUint32(16, 2, true);
  view.setUint32(20, 1, true);
  bytes.set([1, 2, 3, 255, 4, 5, 6, 255], 24);
  const frame = parseGlassFrame(bytes.buffer);
  assert.equal(frame.width, 2);
  assert.deepEqual([...frame.pixels], [1, 2, 3, 255, 4, 5, 6, 255]);
  assert.deepEqual(glassFramePlacement(frame, 1.5), {
    "--glass-frame-x": "-13.33px",
    "--glass-frame-y": "0px",
    "--glass-frame-width": "800px",
    "--glass-frame-height": "306.67px",
  });
  // A small message comes as a plain array of bytes.
  assert.equal(parseGlassFrame([...bytes]).height, 1);
});

test("an empty or short message means no frame: the capture paused", () => {
  assert.equal(parseGlassFrame(new ArrayBuffer(0)), null);
  assert.equal(parseGlassFrame([]), null);
  const header = new Uint8Array(24);
  new DataView(header.buffer).setUint32(16, 4, true);
  new DataView(header.buffer).setUint32(20, 4, true);
  assert.equal(parseGlassFrame(header.buffer), null);
});

test("clipboard rows are text, image or files, and the type filter matches them", () => {
  assert.equal(clipboardItemKind({ kind: "text" }), "text");
  assert.equal(clipboardItemKind({ kind: "text", files: [] }), "text");
  assert.equal(clipboardItemKind({ kind: "text", files: ["C:/a.txt"] }), "file");
  assert.equal(clipboardItemKind({ kind: "image" }), "image");
  assert.equal(matchesKind({ kind: "image" }, "any"), true);
  assert.equal(matchesKind({ kind: "image" }, "text"), false);
});
