import assert from "node:assert/strict";
import test from "node:test";
import { estimateBatteryPower, recordBatteryEnergy } from "../../src/features/battery/powerEstimate.ts";

const makeSnapshot = (remainingMwh, charging, fullMwh = 50_000) => ({
  percent: 72,
  charging,
  pluggedIn: charging,
  secondsRemaining: null,
  details: { remainingMwh, fullMwh, designMwh: 52_000, rateMw: charging ? 12_400 : -16_500 },
});

function energySamples(values, charging, fullMwh) {
  return values.reduce((samples, remainingMwh, index) =>
    recordBatteryEnergy(samples, makeSnapshot(remainingMwh, charging, fullMwh), index * 5_000), []);
}

test("capacity slope yields signed power and an ETA to full or empty", () => {
  assert.deepEqual(estimateBatteryPower(energySamples([32_000, 32_025, 32_050], true)), { rateMw: 18_000, minutes: 60 });
  assert.deepEqual(estimateBatteryPower(energySamples([35_800, 35_775, 35_750], false)), { rateMw: -18_000, minutes: 120 });
  assert.deepEqual(estimateBatteryPower(energySamples([32_000, 32_025, 32_050], true, null)), { rateMw: 18_000, minutes: null });
});

test("the estimate requires ten seconds and a change in sampled energy", () => {
  assert.equal(estimateBatteryPower(energySamples([32_000, 32_150], true)), null);
  assert.equal(estimateBatteryPower(energySamples([32_000, 32_000, 32_000], true)), null);
  assert.equal(estimateBatteryPower(energySamples([32_000, 32_150, 31_900], true))?.rateMw, -36_000);
  assert.equal(estimateBatteryPower(energySamples([32_000, 32_150, 32_300], false)), null);
});

test("gaps, missing readings, a power-source switch or changed pack capacity restart estimation", () => {
  const run = energySamples([35_800, 35_650, 35_500], false);
  const same = makeSnapshot(35_400, false);
  assert.equal(recordBatteryEnergy(run, same, 11_000), run);
  assert.equal(recordBatteryEnergy(run, same, 31_000).length, 1);
  assert.equal(recordBatteryEnergy(run, null, 15_000).length, 0);
  assert.equal(recordBatteryEnergy(run, { ...same, pluggedIn: true }, 15_000).length, 1);
  assert.equal(recordBatteryEnergy(run, makeSnapshot(35_400, true), 15_000).length, 1);
  assert.equal(recordBatteryEnergy(run, makeSnapshot(35_400, false, 49_000), 15_000).length, 1);
  assert.equal(recordBatteryEnergy(run, { ...same, details: null }, 15_000).length, 0);
});

test("capacity decides net direction even if the driver's rate and charging flag disagree", () => {
  const connected = (energy, charging) => ({ ...makeSnapshot(energy, true), charging });
  const samples = [connected(32_000, true), connected(31_950, false), connected(31_900, true)]
    .reduce((current, snapshot, index) => recordBatteryEnergy(current, snapshot, index * 5_000), []);
  assert.deepEqual(estimateBatteryPower(samples), { rateMw: -36_000, minutes: 54 });
});

test("the rolling estimate responds to a rate change once the older readings fall out of the window", () => {
  const samples = energySamples([33_000, 33_125, 33_250, 33_275, 33_300, 33_325, 33_350, 33_375], true);
  assert.equal(samples[0].at, 15_000);
  assert.deepEqual(estimateBatteryPower(samples), { rateMw: 18_000, minutes: 56 });
  const faster = recordBatteryEnergy(samples, makeSnapshot(33_425, true), 40_000);
  assert.equal(estimateBatteryPower(faster)?.rateMw, 22_500);
});
