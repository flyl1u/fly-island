import assert from "node:assert/strict";
import test from "node:test";
import { COVERED_YEARS, holidayOn, yearPlan } from "../../src/features/todos/calendar-marks/holidays.ts";
import { TEXT } from "../../src/features/todos/calendar-marks/text.ts";

/** Every YYYY-MM-DD of a year, walked in UTC so no timezone shifts a day. */
function daysOfYear(year) {
  const days = [];
  for (let cursor = Date.UTC(year, 0, 1); cursor < Date.UTC(year + 1, 0, 1); cursor += 86_400_000) {
    const date = new Date(cursor);
    days.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`);
  }
  return days;
}

test("every covered year names the six holidays the notice always lists", () => {
  assert.ok(COVERED_YEARS.length > 0, "at least one year has data");
  for (const year of COVERED_YEARS) {
    const names = new Set();
    for (const date of daysOfYear(year)) {
      const mark = holidayOn(date);
      if (mark?.kind === "off" && mark.name) names.add(mark.name);
    }
    for (const required of ["newYear", "springFestival", "qingming", "labour", "dragonBoat", "nationalDay"]) {
      assert.ok(names.has(required), `${year} is missing ${required}`);
    }
  }
});

test("a break is one unbroken run of days off", () => {
  for (const year of COVERED_YEARS) {
    const days = daysOfYear(year).map((date) => holidayOn(date));
    // Every day between a named day and the next named or unmarked day must be off.
    days.forEach((mark, index) => {
      if (mark?.kind !== "off" || mark.name) return;
      const previous = days[index - 1];
      assert.equal(previous?.kind, "off", `${year} day ${index + 1}: a break day must be preceded by one`);
    });
  }
});

test("a named day opens its break and never repeats inside it", () => {
  for (const year of COVERED_YEARS) {
    const days = daysOfYear(year);
    const names = [];
    days.forEach((date, index) => {
      const mark = holidayOn(date);
      if (mark?.kind === "off" && mark.name) names.push(mark.name);
    });
    assert.equal(new Set(names).size, names.length, `${year} repeats a holiday name`);
  }
});

test("two holidays never start on the same day", () => {
  for (const year of COVERED_YEARS) {
    const starts = daysOfYear(year).filter((date) => {
      const mark = holidayOn(date);
      return mark?.kind === "off" && mark.name;
    });
    assert.equal(new Set(starts).size, starts.length, `${year} starts two breaks on one day`);
  }
});

test("the raw plan keeps every entry inside its year and out of the breaks", () => {
  for (const year of COVERED_YEARS) {
    const plan = yearPlan(year);
    assert.ok(plan, `${year} should have a plan`);
    for (const span of plan.breaks) {
      const last = span.to ?? span.from;
      assert.equal(Number(span.from.slice(0, 4)), year, `${span.name} starts outside ${year}`);
      assert.equal(Number(last.slice(0, 4)), year, `${span.name} ends outside ${year}`);
      assert.ok(span.from <= last, `${span.name} ends before it starts`);
    }
    for (const date of plan.workdays) {
      assert.equal(Number(date.slice(0, 4)), year, `${date} is filed under ${year}`);
      const clash = plan.breaks.some((span) => date >= span.from && date <= (span.to ?? span.from));
      assert.ok(!clash, `${date} cannot be both a day off and a workday`);
    }
  }
});

test("a break names its first day and marks the rest as off", () => {
  assert.deepEqual(holidayOn("2026-01-01"), { kind: "off", name: "newYear" });
  assert.deepEqual(holidayOn("2026-01-02"), { kind: "off", name: null });
  assert.deepEqual(holidayOn("2026-01-03"), { kind: "off", name: null });
  assert.equal(holidayOn("2026-01-04")?.kind, "work");
});

test("the nine-day Spring Festival keeps its name only on the first day", () => {
  assert.deepEqual(holidayOn("2026-02-15"), { kind: "off", name: "springFestival" });
  assert.deepEqual(holidayOn("2026-02-23"), { kind: "off", name: null });
  assert.equal(holidayOn("2026-02-24"), undefined);
  assert.equal(holidayOn("2026-02-14")?.kind, "work");
  assert.equal(holidayOn("2026-02-28")?.kind, "work");
});

test("single-day holidays need no range", () => {
  assert.deepEqual(holidayOn("2027-06-09"), { kind: "off", name: "dragonBoat" });
  assert.deepEqual(holidayOn("2025-01-01"), { kind: "off", name: "newYear" });
  assert.equal(holidayOn("2027-06-10"), undefined);
});

test("a make-up workday is marked even though it falls on a weekend", () => {
  assert.deepEqual(holidayOn("2026-09-20"), { kind: "work" });
  assert.deepEqual(holidayOn("2027-10-09"), { kind: "work" });
});

test("days outside the covered years carry no mark", () => {
  assert.equal(holidayOn("2024-10-01"), undefined);
  assert.equal(holidayOn("2028-01-01"), undefined);
  assert.equal(holidayOn("2026-11-19"), undefined);
});

test("every holiday has a caption", () => {
  const keys = [
    "2026-01-01", "2026-02-15", "2026-04-04", "2026-05-01",
    "2026-06-19", "2026-09-25", "2026-10-01",
  ].map((date) => holidayOn(date)?.name);

  assert.equal(keys.length, 7);
  for (const key of keys) {
    assert.ok(key, "每个样例日期都应该对应一个节日");
    assert.ok(TEXT.holidayNames[key], `${key} 缺少文案`);
  }
});
