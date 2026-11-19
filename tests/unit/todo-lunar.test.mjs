import assert from "node:assert/strict";
import test from "node:test";
import { lunarDay } from "../../src/features/todos/lunar.ts";

test("known lunar dates land on the right day", () => {
  // Spring Festival, Mid-Autumn and Dragon Boat, all first or fifteenth days.
  assert.equal(lunarDay("2026-02-17"), "初一");
  assert.equal(lunarDay("2026-09-25"), "十五");
  assert.equal(lunarDay("2026-06-19"), "初五");
  assert.equal(lunarDay("2025-01-29"), "初一");
  assert.equal(lunarDay("2027-02-06"), "初一");
  assert.equal(lunarDay("2025-10-06"), "十五");
  assert.equal(lunarDay("2027-09-15"), "十五");
  // The epoch: 1900-01-31 opened the first lunar month of 1900.
  assert.equal(lunarDay("1900-01-31"), "初一");
});

test("a lunar month runs 29 or 30 days and the naming follows", () => {
  const names = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

  // Walk one lunar month from the 2026 Spring Festival and check every day is named in order.
  const start = Date.UTC(2026, 1, 17);
  for (let index = 0; index < 29; index += 1) {
    const date = new Date(start + index * 86_400_000);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    assert.equal(lunarDay(key), names[index], `${key} should be ${names[index]}`);
  }
});

test("dates outside 1900–2100 have no lunar day", () => {
  assert.equal(lunarDay("1899-12-31"), null);
  assert.equal(lunarDay("2101-06-01"), null);
});
