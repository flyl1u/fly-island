import test from "node:test";
import assert from "node:assert/strict";
import { batteryHistoryInRange, EMPTY_BATTERY_HISTORY, nearestBatterySample, recordBatterySample } from "../../src/features/battery/history.ts";

function sample(at, charging = false) {
  return { at, percent: 70, flow: charging ? "charging" : "discharging" };
}

test("battery history respects the sample interval and filters to the selected window", () => {
  const start = recordBatterySample(EMPTY_BATTERY_HISTORY, sample(0));
  assert.equal(recordBatterySample(start, sample(29_999)), start);
  const middle = recordBatterySample(start, sample(3_600_000, true));
  const end = recordBatterySample(middle, sample(7_200_000));
  assert.deepEqual(batteryHistoryInRange(end, 1, 7_200_000), [sample(3_600_000, true), sample(7_200_000)]);
  assert.deepEqual(batteryHistoryInRange(end, 2, 10_800_000), [sample(3_600_000, true), sample(7_200_000)]);
  assert.deepEqual(batteryHistoryInRange(end, 0, 7_200_000), end.points);
});

test("sample inspection snaps to the closest timestamp across uneven gaps", () => {
  const points = [sample(0), sample(30_000), sample(150_000)];
  assert.equal(nearestBatterySample([], 0), -1);
  assert.equal(nearestBatterySample(points, -100), 0);
  assert.equal(nearestBatterySample(points, 90_000), 1);
  assert.equal(nearestBatterySample(points, 90_001), 2);
  assert.equal(nearestBatterySample(points, 900_000), 2);
});

test("long sessions retain their first and latest samples with bounded storage", () => {
  let history = EMPTY_BATTERY_HISTORY;
  for (let index = 0; index <= 1440; index++) {
    history = recordBatterySample(history, sample(index * 30_000));
  }
  assert.equal(history.intervalMs, 60_000);
  assert.equal(history.points.length, 721);
  assert.deepEqual(history.points[0], sample(0));
  assert.deepEqual(history.points.at(-1), sample(43_200_000));
});
