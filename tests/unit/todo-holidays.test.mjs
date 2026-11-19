import assert from "node:assert/strict";
import test from "node:test";
import { holidayOn } from "../../src/features/todos/holidays.ts";
import { en, zhCN } from "../../src/i18n/sections/notebook.ts";

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

test("every holiday key has a name in both languages", () => {
  const keys = [
    "2026-01-01",
    "2026-02-15",
    "2026-04-04",
    "2026-05-01",
    "2026-06-19",
    "2026-09-25",
    "2026-10-01",
  ].map((date) => holidayOn(date)?.name);

  assert.equal(keys.length, 7);
  for (const key of keys) {
    assert.ok(key, "each sample date should name its holiday");
    assert.ok(zhCN.holidayNames[key], `${key} is missing from zhCN`);
    assert.ok(en.holidayNames[key], `${key} is missing from en`);
  }
});
