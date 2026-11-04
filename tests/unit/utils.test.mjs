import assert from "node:assert/strict";
import test from "node:test";
import { clamp } from "../../src/utils/number.ts";
import { HEX_COLOR_PATTERN, getColorSetting } from "../../src/utils/color.ts";
import { getErrorMessage } from "../../src/utils/error.ts";
import { getDisplayDateParts, getLocalDateString } from "../../src/utils/date.ts";

test("clamp keeps values inside the inclusive range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test("only six-digit hex colors are accepted as color settings", () => {
  assert.equal(HEX_COLOR_PATTERN.test("#3ae489"), true);
  assert.equal(HEX_COLOR_PATTERN.test("#ABCDEF"), true);
  for (const value of ["#abc", "3ae489", "#3ae4899", "#gggggg", " #3ae489", ""]) {
    assert.equal(HEX_COLOR_PATTERN.test(value), false, value);
  }
  assert.equal(getColorSetting("#112233", "#ffffff"), "#112233");
  for (const value of ["#123", "red", 123, null, undefined, {}]) {
    assert.equal(getColorSetting(value, "#ffffff"), "#ffffff", String(value));
  }
});

test("error messages come from Error instances or the stringified value", () => {
  assert.equal(getErrorMessage(new Error("磁盘已满")), "磁盘已满");
  assert.equal(getErrorMessage("plain failure"), "plain failure");
  assert.equal(getErrorMessage(42), "42");
  assert.equal(getErrorMessage(null), "null");
});

test("local date strings use the local calendar day with zero padding", () => {
  assert.equal(getLocalDateString(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(getLocalDateString(new Date(2026, 10, 30, 0, 0)), "2026-11-30");
});

test("display date parts include a localized weekday for valid dates", () => {
  assert.deepEqual(getDisplayDateParts("2026-11-03", { localeTag: "en" }), {
    year: "2026",
    month: "11",
    day: "03",
    weekday: "Tuesday",
  });
  assert.equal(getDisplayDateParts("2026-11-03", { localeTag: "zh-CN" }).weekday, "星期二");
});

test("invalid stored dates fall back to their raw parts without a weekday", () => {
  assert.deepEqual(getDisplayDateParts("not-a-date", { localeTag: "en" }), {
    year: "not",
    month: "a",
    day: "date",
    weekday: "",
  });
  assert.deepEqual(getDisplayDateParts("", { localeTag: "en" }), {
    year: "",
    month: "",
    day: "",
    weekday: "",
  });
});
