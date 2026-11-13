import assert from "node:assert/strict";
import test from "node:test";
import { clampStepperValue, parseStepperInput, stepStepperValue } from "../../src/utils/numberStepper.ts";

test("clamps to both inclusive boundaries", () => {
  assert.deepEqual([-5, 1, 25, 240, 999].map(value => clampStepperValue(value, 1, 240)), [1, 1, 25, 240, 240]);
});
test("parses arbitrary integers; restores invalid edits and clamps out of range edits", () => {
  for (const input of ["", " ", "1.5", "1e2", "-1", "abc", "9".repeat(400)]) {
    assert.equal(parseStepperInput(input, 25, 1, 240), 25, input);
  }
  assert.equal(parseStepperInput("007", 25, 1, 240), 7);
  assert.equal(parseStepperInput("0", 25, 1, 240), 1);
  assert.equal(parseStepperInput("999", 25, 1, 240), 240);
});
test("steps relative to arbitrary integers, accelerates and stops at endpoints", () => {
  assert.equal(stepStepperValue(7, 1, 5, 1, 240), 12);
  assert.equal(stepStepperValue(7, -1, 5, 1, 240), 2);
  assert.equal(stepStepperValue(7, 10, 5, 1, 240), 57);
  assert.equal(stepStepperValue(7, -10, 5, 1, 240), 1);
  assert.equal(stepStepperValue(239, 1, 5, 1, 240), 240);
  assert.equal(stepStepperValue(240, 1, 5, 1, 240), 240);
});
