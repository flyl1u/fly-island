import assert from "node:assert/strict";
import test from "node:test";
import { batteryHealth, summarizeBattery } from "../../src/features/battery/display.ts";
import { formatBatteryReadout } from "../../src/features/battery/readout.ts";
import { formatBatteryDetails } from "../../src/features/battery/details.ts";
import { batteryIslandWidth } from "../../src/features/battery/slotWidth.ts";
import { en, zhCN } from "../../src/i18n/sections/battery.ts";

const snapshot = { percent: 71, pluggedIn: false, charging: false, secondsRemaining: 7801, details: null };

test("charging and plug status stay distinct", () => {
  assert.equal(summarizeBattery({ ...snapshot, pluggedIn: true, charging: true }).state, "charging");
  assert.equal(summarizeBattery({ ...snapshot, pluggedIn: true }).state, "idle");
  assert.equal(summarizeBattery({ ...snapshot, pluggedIn: true, charging: null }).state, "plugged");
  assert.equal(summarizeBattery({ ...snapshot, pluggedIn: true, percent: 100 }).state, "full");
  const onAC = { ...snapshot, pluggedIn: true, charging: true, secondsRemaining: null };
  assert.equal(summarizeBattery({ ...onAC, details: { rateMw: -500 } }).state, "pluggedDischarging");
  assert.equal(summarizeBattery({ ...onAC, percent: 100 }).state, "full");
  assert.equal(summarizeBattery(onAC, { rateMw: -500, minutes: 50 }).state, "pluggedDischarging");
  assert.equal(summarizeBattery({ ...snapshot, pluggedIn: null }).state, "unknown");
});

test("runtime is rounded to minutes and only shown when on battery", () => {
  assert.equal(summarizeBattery(snapshot).minutes, 131);
  assert.equal(summarizeBattery({ ...snapshot, secondsRemaining: null }).minutes, null);
  assert.equal(summarizeBattery({ ...snapshot, pluggedIn: true }).minutes, null);
  const onAC = { ...snapshot, pluggedIn: true, charging: true, secondsRemaining: null };
  assert.equal(summarizeBattery(onAC).minutes, null);
  assert.equal(summarizeBattery(onAC, { rateMw: -500, minutes: 50 }).minutes, 50);
});

test("the readout shows charge or time left, never wider than 100%", () => {
  const summary = summarizeBattery(snapshot);
  const charge = formatBatteryReadout(summary, "percent", "en", en);
  const runtime = formatBatteryReadout(summary, "remaining", "en", en);
  assert.equal(charge.value, "71%");
  assert.equal(runtime.value, "2:11");
  assert.equal(runtime.runtime, "About 2 hr 11 min left");
  assert.equal(charge.runtime, runtime.runtime, "the tooltip carries the time left in either mode");
  assert.equal(runtime.label, charge.label);
  assert.equal(formatBatteryReadout({ ...summary, minutes: null }, "remaining", "en", en).value, "71%");
  assert.equal(formatBatteryReadout({ ...summary, minutes: 5 }, "remaining", "en", en).value, "0:05");
  assert.equal(formatBatteryReadout({ ...summary, minutes: 12_345 }, "remaining", "en", en).value, "99:59");
});

test("full charge is a status and charging counts down to full", () => {
  const charging = { ...snapshot, pluggedIn: true, charging: true, secondsRemaining: null };
  const estimate = { rateMw: 8_000, minutes: 18 };
  const full = formatBatteryReadout(summarizeBattery({ ...charging, percent: 100 }, estimate), "remaining", "zh-CN", zhCN);
  assert.equal(full.value, "满电");
  assert.equal(full.runtime, null);
  assert.equal(full.label, "电池，已充满");
  const filling = formatBatteryReadout(summarizeBattery(charging, estimate), "remaining", "zh-CN", zhCN);
  assert.equal(filling.value, "0:18");
  assert.equal(filling.runtime, "约 18 分钟充满");
  assert.equal(filling.label, "电池 71%，充电中");
});

test("health depends on both capacities and tolerates calibration above design", () => {
  assert.equal(batteryHealth(49_457, 59_425), 83);
  assert.equal(batteryHealth(50_001, 50_000), 100);
  assert.equal(batteryHealth(50_000, 0), null);
  assert.equal(batteryHealth(null, 50_000), null);
});

test("the details say each thing once: where it is heading, how fast, and what the battery still holds", () => {
  const details = { remainingMwh: 35_800, fullMwh: 50_400, designMwh: 56_000, rateMw: 12_400 };
  const charging = formatBatteryDetails({ ...snapshot, pluggedIn: true, charging: true, details }, { rateMw: 14_000, minutes: 63 }, "en", en);
  assert.equal(charging.status, "Charging");
  assert.equal(charging.runtime, "About 1 hr 3 min until full");
  assert.equal(charging.power, "14.0 W", "the measured rate, unsigned");
  assert.deepEqual(charging.stats.map(({ key, value }) => [key, value]), [["health", "90%"], ["full", "50.4 Wh"], ["design", "56.0 Wh"]]);

  const discharging = formatBatteryDetails({ ...snapshot, details: { ...details, rateMw: -16_500 } }, null, "en", en);
  assert.equal(discharging.power, "16.5 W", "the driver's rate until samples arrive");
  assert.equal(discharging.runtime, "About 2 hr 11 min left", "the same estimate the collapsed slot shows");

  const idle = formatBatteryDetails({ ...snapshot, pluggedIn: true, secondsRemaining: null, details: { ...details, rateMw: 0 } }, null, "en", en);
  assert.equal(idle.power, null);
  assert.equal(idle.runtime, null);
  const drainingOnAC = formatBatteryDetails({ ...snapshot, pluggedIn: true, charging: true, secondsRemaining: null, details }, { rateMw: -5_000, minutes: 430 }, "en", en);
  assert.equal(drainingOnAC.status, en.state.pluggedDischarging);
  assert.equal(drainingOnAC.runtime, "About 7 hr 10 min left");
  assert.equal(drainingOnAC.power, "5.0 W");

  const bare = formatBatteryDetails({ ...snapshot, pluggedIn: true, secondsRemaining: null }, null, "en", en);
  assert.deepEqual([bare.runtime, bare.power, bare.stats.length], [null, null, 0], "missing readings leave no placeholder rows");
  assert.deepEqual(formatBatteryDetails({ ...snapshot, details: { ...details, designMwh: null } }, null, "en", en).stats.map(({ key }) => key), ["full"]);
});

test("the collapsed island makes room for the battery slot", () => {
  assert.equal(batteryIslandWidth(317, false), 317);
  assert.equal(batteryIslandWidth(317, true), 373);
  assert.equal(batteryIslandWidth(317, true, 1.2), 381, "the readout grows with the island's font size");
  assert.equal(batteryIslandWidth(240, true, 1, 310), 310, "at least what the status items measure");
  assert.equal(batteryIslandWidth(470, true), 480, "never past the widest island");
});
