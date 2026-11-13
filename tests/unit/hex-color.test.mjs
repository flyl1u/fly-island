import assert from "node:assert/strict";
import test from "node:test";
import { parseHexColor, resolveHexColor } from "../../src/features/appearance/hexColor.ts";

test("hex input accepts hashes, short forms and either case, always saving six uppercase digits", () => {
  for (const [input, expected] of [
    ["#2f2f37", "#2F2F37"], ["2F2f37", "#2F2F37"],
    ["#FFF", "#FFFFFF"], ["aB3", "#AABB33"], ["  #abc  ", "#AABBCC"],
  ]) assert.equal(parseHexColor(input), expected, input);
});

test("invalid hex input rolls back to the original value", () => {
  for (const input of ["", "#", "##fff", "#ff", "12345", "1234567", "#gggggg", "red", "#12345678"]) {
    assert.equal(parseHexColor(input), null, input);
    assert.equal(resolveHexColor(input, "#123456"), "#123456", input);
  }
});
