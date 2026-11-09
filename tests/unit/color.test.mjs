import assert from "node:assert/strict";
import test from "node:test";
import { inkOn, relativeLuminance } from "../../src/utils/color.ts";

test("relative luminance runs from black to white", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  assert.ok(relativeLuminance("#808080") > 0.2 && relativeLuminance("#808080") < 0.23);
  assert.equal(relativeLuminance("not a colour"), 0);
});

test("text on the island is light on dark backgrounds and dark on light ones", () => {
  const light = "241, 240, 246";
  const dark = "24, 24, 30";
  // The default and the old default stay light.
  assert.equal(inkOn("#030303"), light);
  assert.equal(inkOn("#2F2F37"), light);
  assert.equal(inkOn("#ffffff"), dark);
  assert.equal(inkOn("#f4e7c8"), dark);
  assert.equal(inkOn("bad"), light);
});
