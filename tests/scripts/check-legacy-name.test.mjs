import assert from "node:assert/strict";
import test from "node:test";

const pattern = /focus[\s_-]?d(?![a-z])/i;

test("legacy guard catches product spellings and ignores ordinary words", () => {
  for (const value of ["FocuSD", "focusd", "FOCUS-D", "focus_d", "focus d"]) assert.match(value, pattern);
  for (const value of ["focused", "focus", "refocused", "focusdata"]) assert.doesNotMatch(value, pattern);
});
