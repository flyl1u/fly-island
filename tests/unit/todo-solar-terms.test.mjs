import assert from "node:assert/strict";
import test from "node:test";
import { memorialOn } from "../../src/features/todos/memorials.ts";
import { solarTermOn } from "../../src/features/todos/solarTerms.ts";
import { en, zhCN } from "../../src/i18n/sections/notebook.ts";

test("solar terms land on the published dates", () => {
  assert.equal(solarTermOn("2026-02-04"), "立春");
  assert.equal(solarTermOn("2026-04-05"), "清明");
  assert.equal(solarTermOn("2026-06-21"), "夏至");
  assert.equal(solarTermOn("2026-08-07"), "立秋");
  assert.equal(solarTermOn("2026-12-07"), "大雪");
  assert.equal(solarTermOn("2026-12-22"), "冬至");
  assert.equal(solarTermOn("2025-02-03"), "立春");
  assert.equal(solarTermOn("2027-12-22"), "冬至");
});

test("an ordinary day has no solar term", () => {
  assert.equal(solarTermOn("2026-11-19"), null);
  assert.equal(solarTermOn("2026-02-05"), null);
  assert.equal(solarTermOn("1899-12-22"), null);
});

test("every month carries exactly two terms", () => {
  for (let month = 1; month <= 12; month += 1) {
    const prefix = `2026-${String(month).padStart(2, "0")}`;
    const hits = Array.from({ length: 31 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return solarTermOn(`${prefix}-${day}`);
    }).filter(Boolean);
    assert.equal(hits.length, 2, `month ${month} should hold two terms, got ${hits.join("/")}`);
  }
});

test("observances resolve by month and day", () => {
  assert.equal(memorialOn("2026-03-08"), "womensDay");
  assert.equal(memorialOn("2026-09-10"), "teachersDay");
  assert.equal(memorialOn("2026-12-13"), "memorialDay");
  assert.equal(memorialOn("2026-11-19"), null);
});

test("every observance key has a name in both languages", () => {
  const keys = ["01-10", "03-08", "05-04", "06-01", "08-01", "09-10", "12-04", "12-13"]
    .map((suffix) => memorialOn(`2026-${suffix}`));

  for (const key of keys) {
    assert.ok(key, "each sample day should name an observance");
    assert.ok(zhCN.memorialNames[key], `${key} is missing from zhCN`);
    assert.ok(en.memorialNames[key], `${key} is missing from en`);
  }
});
