import test from "node:test";
import assert from "node:assert/strict";
import { documentLines, documentPlainText, naturalTextLines } from "../../src/features/screenshot/ocrDocument.ts";
import { imageScaleSize } from "../../src/features/screenshot/imageResize.ts";

test("OCR fragments become plain lines in visual reading order without formatting", () => {
  const source = [{ text: "right", x: 300, y: 102, width: 100, height: 20 },
    { text: "Title", x: 20, y: 10, width: 200, height: 40 },
    { text: "left", x: 40, y: 100, width: 120, height: 20 }];
  const before = structuredClone(source);
  const lines = naturalTextLines(source);
  assert.deepEqual(lines.map((line) => line.text), ["Title", "left right"]);
  assert.equal(documentPlainText(documentLines(lines, 600, 400)), "Title\nleft right");
  assert.deepEqual(source, before);
});
test("invalid OCR geometry is rejected and clipped without losing stable editing ids", () => {
  const lines = documentLines([{ text: "bad", x: NaN, y: 0, width: 10, height: 10 },
    { text: "valid", x: 90, y: 90, width: 30, height: 30 }], 100, 100);
  assert.equal(lines.length, 1); assert.equal(lines[0].id, 1);
  assert.equal(lines[0].width, 10); assert.equal(lines[0].height, 10);
});
test("recognized markup remains literal plain text", () => {
  const text = '<img src=x onerror="alert(1)"> & text';
  const lines = documentLines(naturalTextLines([{ text, x: 5, y: 5, width: 400, height: 20 }]), 500, 100);
  assert.equal(documentPlainText(lines), text);
});
test("multiline OCR becomes separate natural lines and empty fragments are discarded", () => {
  const lines = naturalTextLines([{ text: "First\r\nSecond", x: 20, y: 10, width: 200, height: 40 },
    { text: "  ", x: 20, y: 60, width: 200, height: 20 }]);
  assert.deepEqual(lines.map((line) => line.text), ["First", "Second"]);
  assert.equal(lines[1].y, 30);
});
test("wheel resizing uses a percentage and preserves aspect ratio at typical screen sizes", () => {
  assert.deepEqual(imageScaleSize(1053, 773, 50), { width: 527, height: 387, percent: 50 });
  assert.deepEqual(imageScaleSize(3840, 2160, 125), { width: 4800, height: 2700, percent: 125 });
});
test("image scale limits avoid zero dimensions and excessive export allocations", () => {
  const maximum = imageScaleSize(12000, 8000, 400);
  assert.ok(maximum.width <= 16384 && maximum.height <= 16384 && maximum.width * maximum.height <= 64_000_000);
  const minimum = imageScaleSize(10, 10, 0);
  assert.equal(minimum.width, 1); assert.equal(minimum.height, 1);
});
