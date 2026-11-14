import assert from "node:assert/strict";
import test from "node:test";
import { CLOCK_DATE_FORMATS, DEFAULT_IDLE_CLOCK_SETTINGS as defaults, formatClockDate, formatIdleClock, idleClockTickMs, normalizeIdleClockSettings } from "../../src/features/appearance/idleClockSettings.ts";
import { DEFAULT_SETTINGS, normalizeSettings, withAppearanceFrom } from "../../src/features/appearance/settings.ts";

const date = new Date(2026, 10, 14, 23, 5, 9);
const settings = (patch = {}) => ({ ...defaults, idleClockWeekday: "off", ...patch });

test("all date presets and custom calendar tokens use local calendar fields", () => {
  const expected = { iso: "2026-11-14", slash: "2026/11/14", dayFirst: "14/11/2026", monthFirst: "11/14/2026" };
  for (const [format, text] of Object.entries(expected)) assert.equal(formatClockDate(date, settings({ idleClockDateFormat: format }), "en"), text);
  for (const format of CLOCK_DATE_FORMATS) assert.ok(formatClockDate(date, settings({ idleClockDateFormat: format }), "zh-CN"));
  assert.equal(formatClockDate(date, settings({ idleClockDateFormat: "custom", idleClockCustomFormat: "YYYY年M月D日 YY/MM/DD ddd dddd" }), "en"), "2026年11月14日 26/11/14 Sat Saturday");
});

test("time, date, order, seconds and hour cycle combine independently", () => {
  assert.equal(formatIdleClock(date, settings({ idleClockDisplay: "time" }), "en"), "23:05");
  assert.equal(formatIdleClock(date, settings({ idleClockDisplay: "time", idleClockHour12: true, idleClockSeconds: true }), "en"), "11:05:09 PM");
  assert.equal(formatIdleClock(date, settings({ idleClockDateFormat: "iso", idleClockOrder: "dateFirst" }), "en"), "2026-11-14 · 23:05");
  assert.equal(formatIdleClock(date, settings({ idleClockDisplay: "date", idleClockDateFormat: "iso", idleClockWeekday: "long" }), "en"), "2026-11-14 Saturday");
  assert.equal(formatIdleClock(date, settings({ idleClockDisplay: "date", idleClockDateFormat: "custom", idleClockCustomFormat: "M/D ddd", idleClockWeekday: "long" }), "en"), "11/14 Sat");
  const midnight = new Date(2026, 0, 1, 0, 0, 0);
  assert.equal(formatIdleClock(midnight, settings({ idleClockDisplay: "time" }), "en"), "00:00");
});

test("old or malformed settings fall back; every new setting persists and resets with appearance", () => {
  assert.deepEqual(normalizeIdleClockSettings(null), defaults);
  assert.deepEqual(normalizeIdleClockSettings({ idleClockEnabled: "yes", idleClockDisplay: "oops", idleClockDateFormat: {}, idleClockCustomFormat: 7 }), defaults);
  const custom = settings({ idleClockEnabled: false, idleClockDisplay: "date", idleClockHour12: true, idleClockSeconds: true, idleClockWeekday: "long", idleClockOrder: "dateFirst", idleClockDateFormat: "custom", idleClockCustomFormat: "YYYY年MM月DD日" });
  const saved = normalizeSettings(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, ...custom })));
  for (const key of Object.keys(defaults)) assert.equal(saved[key], custom[key]);
  const reset = withAppearanceFrom(saved, DEFAULT_SETTINGS);
  for (const key of Object.keys(defaults)) assert.equal(reset[key], defaults[key]);
  assert.equal(normalizeIdleClockSettings({ idleClockCustomFormat: "a".repeat(200) }).idleClockCustomFormat.length, 80);
});

test("date-only clocks never tick every second", () => {
  assert.equal(idleClockTickMs(settings({ idleClockSeconds: true })), 1000);
  assert.equal(idleClockTickMs(settings({ idleClockSeconds: true, idleClockDisplay: "date" })), 60_000);
  assert.equal(idleClockTickMs(defaults), 60_000);
});
