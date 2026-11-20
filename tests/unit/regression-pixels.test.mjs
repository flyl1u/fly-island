import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { capturePixelProbe, cornerPixels } from "../../scripts/regression-pixels.mjs";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function screenshot(pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(pixels.length, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.from([0, ...pixels.flatMap((pixel) => [...pixel, 255])]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(row)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

function probe(png) {
  return capturePixelProbe({ send: async () => ({ data: png }) }, JSON.stringify({
    points: {
      leftShoulder: [0, 0], leftSeam: [1, 0], leftBody: [2, 0],
      rightBody: [3, 0], rightSeam: [4, 0], rightShoulder: [5, 0],
    },
    viewport: [6, 1],
  }));
}

test("classic shoulder pixel probe allows at most two channels of edge noise", async () => {
  const result = await probe(screenshot([
    [20, 30, 40], [22, 32, 42], [20, 30, 40],
    [20, 30, 40], [21, 31, 41], [20, 30, 40],
  ]));
  assert.equal(result.passed, true);
  assert.match(result.label, /maxDiff=2$/);
});

test("classic shoulder pixel probe fails when the seam differs by more than two", async () => {
  const result = await probe(screenshot([
    [20, 30, 40], [23, 30, 40], [20, 30, 40],
    [20, 30, 40], [20, 30, 40], [20, 30, 40],
  ]));
  assert.equal(result.passed, false);
  assert.match(result.label, /maxDiff=3$/);
});

test("bottom corners must show the desktop outside the curve and the fill inside it", () => {
  const desktop = [156, 192, 214, 255];
  const shadowed = [140, 176, 198, 255];
  const fill = [40, 42, 50, 255];
  const rounded = Object.fromEntries(["left", "right"].flatMap((side) => [
    [`${side}Desktop`, desktop], [`${side}CornerOut`, shadowed], [`${side}CornerIn`, fill], [`${side}CornerTop`, fill],
  ]));
  assert.equal(cornerPixels(rounded).passed, true);
  // The regression from 2026-11-20: square bottom corners and a notch where the corner begins.
  assert.equal(cornerPixels({ ...rounded, leftCornerOut: fill }).passed, false);
  assert.equal(cornerPixels({ ...rounded, rightCornerTop: desktop }).passed, false);
});
