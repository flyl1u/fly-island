import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";
import { capturePixelProbe, cornerPixels, shoulderOutlinePixels } from "../../scripts/regression-pixels.mjs";

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

function screenshot(...rows) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(rows[0].length, 0);
  header.writeUInt32BE(rows.length, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.from(rows.flatMap((row) => [0, ...row.flatMap((pixel) => [...pixel, 255])]));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
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

function glassProbe(height, colorAt, mode, dpr = 1) {
  const width = 34;
  const top = 4;
  const rows = Array.from({ length: (height + top) * dpr }, (_, y) =>
    Array.from({ length: width * dpr }, (_, x) => colorAt(y / dpr - top, x / dpr)),
  );
  return capturePixelProbe({ send: async () => ({ data: screenshot(...rows) }) }, JSON.stringify({
    points: {}, viewport: [width, height + top], dpr,
    glassContinuity: { x: 16, top, height, mode },
  }));
}

test("glass rows allow a smooth gradient with isolated grain", async () => {
  const result = await glassProbe(38, (y, x) => {
    if (y < 2 || y > 32) return [160, 190, 220];
    return [40 + y + (x === 16 && y === 20 ? 20 : 0), 70 + y, 100 + y];
  }, "collapsed");
  assert.equal(result.passed, true, result.label);
  assert.match(result.label, /collapsed glass rows peakDiff=1\.80 at y=20/);
});

test("glass rows detect a horizontal step in any channel", async () => {
  const result = await glassProbe(240, (y) => [40, 70, y < 28 ? 110 : 100], "expanded");
  assert.equal(result.passed, false);
  assert.match(result.label, /expanded glass rows peakDiff=10\.00 at y=28/);
});

test("short islands allow a steeper lens fade only near the top", async () => {
  const lens = (y) => 100 + Math.round(Math.max(0, 27 * 0.18 - y) * 6);
  const smooth = await glassProbe(27, (y) => [lens(y), 70, 100], "collapsed");
  assert.equal(smooth.passed, true, smooth.label);
  const seam = await glassProbe(27, (y) => [lens(y) + (y >= 17 ? 5 : 0), 70, 100], "collapsed");
  assert.equal(seam.passed, false);
  assert.match(seam.label, /collapsed glass rows peakDiff=5\.00 at y=17 \(<=3\)/);
});

test("fractional DPR measures steps per CSS pixel", async () => {
  const result = await glassProbe(80, (y) => [15 + Math.round(y * 3), 70, 100], "expanded", 1.5);
  assert.equal(result.passed, true, result.label);
  assert.match(result.label, /expanded glass rows peakDiff=3\.00/);
});

test("the glass row scan stops at 60 CSS pixels on a tall island", async () => {
  const result = await glassProbe(240, (y) => [40, 70, y < 61 ? 100 : 110], "expanded");
  assert.equal(result.passed, true, result.label);
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

function outlineProfile(leftEdges) {
  const width = 64;
  const height = 24;
  const foreground = [24, 35, 46];
  const desktop = [156, 192, 214];
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const left = leftEdges[y] ?? 20;
    const right = width - left;
    for (let x = 0; x < width; x += 1) {
      const coverage = Math.max(0, Math.min(x + 1 - left, right - x, 1));
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[(y * width + x) * 4 + channel] = Math.round(desktop[channel] + (foreground[channel] - desktop[channel]) * coverage);
      }
    }
  }
  return shoulderOutlinePixels({ width, height, pixels }, {
    viewport: [width, height],
    contour: { body: [20, 44], outside: [14, 50], top: 0, join: 8, bottom: 18 },
  });
}

test("the outline probe allows a steep top tangent and a continuous side join", () => {
  const result = outlineProfile([14.5, 16.9, 18, 18.7, 19.2, 19.6, 19.85, 19.98, 20]);
  assert.equal(result.passed, true, result.label);
});

test("the outline probe rejects an outward pixel step at the side join", () => {
  const result = outlineProfile([14.5, 16.9, 18, 18.7, 19.2, 19.6, 19.85, 19.98, 19, 19, 20]);
  assert.equal(result.passed, false);
  assert.match(result.label, /reverse=1\.00/);
});

test("the outline probe rejects a monotone one-pixel jump at the side join", () => {
  const result = outlineProfile([14.5, 16.9, 18, 18.5, 18.8, 18.9, 19, 19, 20]);
  assert.equal(result.passed, false);
  assert.match(result.label, /jump=1\.00 reverse=0\.00/);
});
