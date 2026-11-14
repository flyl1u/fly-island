import assert from "node:assert/strict";
import test from "node:test";
import { readableTint, tintFromPixels } from "../../src/features/media/artworkTint.ts";

const lightness = (tint) => {
  const [r, g, b] = tint.split(",").map(Number);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
};

test("a dark or a pale cover still gives an accent that reads on black", () => {
  for (const tint of [readableTint(20, 10, 40), readableTint(250, 245, 255)]) {
    assert.ok(lightness(tint) >= 0.67 && lightness(tint) <= 0.79, tint);
  }
});

test("a grey cover stays grey", () => {
  const [r, g, b] = readableTint(90, 90, 90).split(",").map(Number);
  assert.equal(r, g);
  assert.equal(g, b);
});

test("colourful pixels outweigh a white background", () => {
  // Three white pixels and one saturated red one.
  const data = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 220, 30, 40, 255];
  const [r, g, b] = tintFromPixels(data).split(",").map(Number);
  assert.ok(r > g + 40 && r > b + 40, `${r}, ${g}, ${b}`);
});

test("transparent pixels are ignored, and a fully transparent cover gives none", () => {
  assert.equal(tintFromPixels([255, 0, 0, 0, 0, 255, 0, 10]), null);
});

test("the light variant keeps the hue at a lightness that reads on white", async () => {
  const { tintOnLight } = await import("../../src/features/media/artworkTint.ts");
  const [r, g, b] = tintOnLight("240, 120, 120").split(",").map(Number);
  assert.ok(r > g && r > b, "still red");
  assert.ok(Math.max(r, g, b) < 200 && (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255 < 0.45, "dark enough for white");
});
