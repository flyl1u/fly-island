import assert from "node:assert/strict";
import test from "node:test";
import { createLowBatteryState, takeLowBatteryAlert } from "../../src/features/device-battery/lowBattery.ts";

const headset = (percent, patch = {}) => ({
  id: "hyperx:06be",
  name: "HyperX Cloud III S Wireless",
  kind: "headset",
  percent,
  charging: false,
  approximate: false,
  unconfirmed: false,
  receiverOnly: false,
  state: "current",
  confirmedAt: "",
  ...patch,
});

test("a low reading alerts once and stays quiet while it drains", () => {
  const state = createLowBatteryState();
  assert.deepEqual(takeLowBatteryAlert(state, [headset(18)]), {
    id: "hyperx:06be",
    name: "HyperX Cloud III S Wireless",
    percent: 18,
  });
  assert.equal(takeLowBatteryAlert(state, [headset(15)]), null);
  assert.equal(takeLowBatteryAlert(state, [headset(9)]), null);
});

test("charging clears the alert so the next discharge alerts again", () => {
  const state = createLowBatteryState();
  takeLowBatteryAlert(state, [headset(18)]);
  assert.equal(takeLowBatteryAlert(state, [headset(18, { charging: true })]), null);
  assert.equal(takeLowBatteryAlert(state, [headset(17, { charging: true })]), null);
  assert.deepEqual(takeLowBatteryAlert(state, [headset(16)]), {
    id: "hyperx:06be",
    name: "HyperX Cloud III S Wireless",
    percent: 16,
  });
});

test("climbing past the reset level arms the next alert", () => {
  const state = createLowBatteryState();
  takeLowBatteryAlert(state, [headset(19)]);
  assert.equal(takeLowBatteryAlert(state, [headset(30)]), null);
  assert.deepEqual(takeLowBatteryAlert(state, [headset(20)]), {
    id: "hyperx:06be",
    name: "HyperX Cloud III S Wireless",
    percent: 20,
  });
});

test("an unknown level is ignored", () => {
  const state = createLowBatteryState();
  assert.equal(takeLowBatteryAlert(state, [headset(null)]), null);
});

test("cached and unconfirmed readings cannot alert or rearm a device", () => {
  const state = createLowBatteryState();
  assert.equal(takeLowBatteryAlert(state, [headset(18, { state: "cached" })]), null);
  assert.equal(takeLowBatteryAlert(state, [headset(18, { unconfirmed: true })]), null);
  assert.equal(takeLowBatteryAlert(state, [headset(18)])?.percent, 18);
  assert.equal(takeLowBatteryAlert(state, [], false), null);
  assert.equal(takeLowBatteryAlert(state, [headset(35, { state: "cached" })]), null);
  assert.equal(takeLowBatteryAlert(state, [headset(17)]), null);
});

test("a device that disappears forgets its alert state", () => {
  const state = createLowBatteryState();
  takeLowBatteryAlert(state, [headset(18)]);
  assert.equal(takeLowBatteryAlert(state, []), null);
  assert.equal(state.size, 0);
  assert.deepEqual(takeLowBatteryAlert(state, [headset(17)]), {
    id: "hyperx:06be",
    name: "HyperX Cloud III S Wireless",
    percent: 17,
  });
});
