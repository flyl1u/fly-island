import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CENTERED_CLOCK_SETTINGS, formatCenteredClock, getCenteredClockParts,
  normalizeCenteredClockSettings, nextClockDelay,
} from "../../src/features/centered-clock/model.ts";

const date = new Date(2026, 10, 21, 14, 5, 9);

test("clock formats local 24-hour time and optional seconds", () => {
  assert.equal(formatCenteredClock(date, DEFAULT_CENTERED_CLOCK_SETTINGS, "en-US"), "14:05");
  assert.equal(formatCenteredClock(date, { ...DEFAULT_CENTERED_CLOCK_SETTINGS, showSeconds: true }, "en-US"), "14:05:09");
});

test("clock formats 12-hour time and custom date order", () => {
  const settings = { ...DEFAULT_CENTERED_CLOCK_SETTINGS, showDate: true, hourCycle: "12", dateFormat: "YYYY/MM/DD" };
  assert.equal(formatCenteredClock(date, settings, "en-US"), "2:05 PM · 2026/11/21");
  assert.equal(formatCenteredClock(date, { ...settings, dateFirst: true, showWeekday: true }, "en-US"), "Sat 2026/11/21 · 2:05 PM");
});

test("clock parts keep time precision and date details separately renderable", () => {
  assert.deepEqual(getCenteredClockParts(date, {
    ...DEFAULT_CENTERED_CLOCK_SETTINGS, showDate: true, showSeconds: true, showWeekday: true, hourCycle: "12",
  }, "en-US"), { time: "2:05", seconds: "09", period: "PM", weekday: "Sat", date: "2026-11-21", dateFirst: false });
});

test("clock settings normalize malformed and partial storage", () => {
  assert.deepEqual(normalizeCenteredClockSettings({ showTime: false, showDate: true, hourCycle: "12", dateFormat: "MM/DD" }), {
    ...DEFAULT_CENTERED_CLOCK_SETTINGS, showTime: false, showDate: true, hourCycle: "12", dateFormat: "MM/DD",
  });
  assert.equal(normalizeCenteredClockSettings({ dateFormat: "  " }).dateFormat, "YYYY-MM-DD");
  assert.equal(normalizeCenteredClockSettings({ showSeconds: "yes", dateFirst: 1 }).showSeconds, false);
});

test("clock refresh aligns to the next minute or second", () => {
  assert.equal(nextClockDelay(61_234, false), 58_766);
  assert.equal(nextClockDelay(61_234, true), 766);
});
