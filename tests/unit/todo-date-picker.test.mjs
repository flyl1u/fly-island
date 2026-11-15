import assert from "node:assert/strict";
import test from "node:test";
import { movePickerFocus, pickerMonthGrid, pickerWeekStart, shiftPickerMonth } from "../../src/features/todos/datePickerCalendar.ts";
import { holdIslandPicker, isIslandPickerOpen } from "../../src/lib/islandPicker.ts";

test("picker weeks follow the UI locale and span complete weeks across month boundaries", () => {
  assert.equal(pickerWeekStart("zh-CN"), 1);
  assert.equal(pickerWeekStart("en-US"), 0);
  const chinese = pickerMonthGrid("2026-11", 1);
  const english = pickerMonthGrid("2026-11", 0);
  assert.equal(chinese[0], "2026-10-26");
  assert.equal(chinese.length, 42);
  assert.equal(english[0], "2026-11-01");
  assert.equal(english.length, 35);
  assert.equal(pickerMonthGrid("2024-02", 1).includes("2024-02-29"), true);
});

test("month navigation clamps the day without overflowing a short month", () => {
  assert.equal(shiftPickerMonth("2024-01-31", 1), "2024-02-29");
  assert.equal(shiftPickerMonth("2025-03-31", -1), "2025-02-28");
  assert.equal(shiftPickerMonth("2026-12-15", 1), "2027-01-15");
});

test("keyboard navigation crosses weeks and months and stops at the minimum date", () => {
  const move = (date, key, start = 1) => movePickerFocus(date, key, start, "2026-11-15");
  assert.equal(move("2026-11-30", "ArrowRight"), "2026-12-01");
  assert.equal(move("2026-11-15", "ArrowLeft"), "2026-11-15");
  assert.equal(move("2026-11-22", "ArrowUp"), "2026-11-15");
  assert.equal(move("2026-11-22", "ArrowDown"), "2026-11-29");
  assert.equal(move("2026-11-25", "Home"), "2026-11-23");
  assert.equal(move("2026-11-25", "Home", 0), "2026-11-22");
  assert.equal(move("2026-11-25", "End"), "2026-11-29");
  assert.equal(move("2026-12-31", "PageUp"), "2026-11-30");
  assert.equal(move("2026-11-30", "PageDown"), "2026-12-30");
  assert.equal(move("2026-11-25", "Enter"), null);
});

test("picker close/focus suppression remains held until every open owner releases it", () => {
  assert.equal(isIslandPickerOpen(), false);
  const releaseA = holdIslandPicker();
  const releaseB = holdIslandPicker();
  assert.equal(isIslandPickerOpen(), true);
  releaseA();
  releaseA();
  assert.equal(isIslandPickerOpen(), true);
  releaseB();
  assert.equal(isIslandPickerOpen(), false);
});
