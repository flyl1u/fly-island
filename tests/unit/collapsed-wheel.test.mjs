import assert from "node:assert/strict";
import test from "node:test";
import { feedWheelGesture, IDLE_WHEEL_GESTURE } from "../../src/windows/island/collapsedWheel.ts";

/** Feeds `[time, deltaY]` events and returns the steps taken, as `[time, step]`. */
function run(events) {
  let gesture = IDLE_WHEEL_GESTURE;
  const steps = [];
  for (const [now, delta] of events) {
    const fed = feedWheelGesture(gesture, delta, now);
    gesture = fed.gesture;
    if (fed.step !== 0) steps.push([now, fed.step]);
  }
  return steps;
}
const every = (ms, count, delta, from = 1000) => Array.from({ length: count }, (_, i) => [from + i * ms, delta]);

test("one mouse notch switches at once, down to the next item and up to the previous", () => {
  assert.deepEqual(run([[1000, 100], [2000, -120]]), [[1000, 1], [2000, -1]]);
});

test("small deltas switch only once they add up to the threshold", () => {
  assert.deepEqual(run(every(20, 4, 12)), []);
  assert.deepEqual(run(every(20, 5, 12)), [[1080, 1]]);
});

test("a long touchpad swipe with its momentum switches once, well past the cooldown", () => {
  assert.deepEqual(run(every(16, 100, 12)), [[1064, 1]]);
});

test("deltas left over from a pause do not add up across gestures", () => {
  assert.deepEqual(run([[1000, 30], [1400, 30], [1800, 30]]), []);
  assert.deepEqual(run([[1000, 30], [1020, -30], [1040, -10]]), []);
});

test("nothing switches during the cooldown, whichever way; after it a pause or a reversal does", () => {
  assert.deepEqual(run([[1000, 100], [1200, 100]]), [[1000, 1]]);
  assert.deepEqual(run([[1000, 100], [1200, -100]]), [[1000, 1]]);
  assert.deepEqual(run([[1000, 100], [1400, 100], [1900, 100]]), [[1000, 1], [1400, 1], [1900, 1]]);
  assert.deepEqual(run([...every(100, 4, 100), [1400, -100]]), [[1000, 1], [1400, -1]]);
});

test("a purely horizontal wheel event is ignored", () => {
  assert.deepEqual(run([[1000, 0]]), []);
});
