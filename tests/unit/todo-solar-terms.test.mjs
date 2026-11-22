import assert from "node:assert/strict";
import test from "node:test";
import { memorialOn } from "../../src/features/todos/calendar-marks/memorials.ts";
import { solarTermOn } from "../../src/features/todos/calendar-marks/solarTerms.ts";
import { zhCN, en } from "../../src/i18n/sections/calendarMarks.ts";

const NAMES = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
  "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];

/**
 * 三年共 72 个节气日期，按北京时间取自日本国立天文台《暦要項》。
 * 这里独立抄一份，与实现里的表分开写，抄错任意一边都会被这条测试发现。
 */
const EXPECTED = {
  2025: [
    [1, 5], [1, 20], [2, 3], [2, 18], [3, 5], [3, 20], [4, 4], [4, 20],
    [5, 5], [5, 21], [6, 5], [6, 21], [7, 7], [7, 22], [8, 7], [8, 23],
    [9, 7], [9, 23], [10, 8], [10, 23], [11, 7], [11, 22], [12, 7], [12, 21],
  ],
  2026: [
    [1, 5], [1, 20], [2, 4], [2, 18], [3, 5], [3, 20], [4, 5], [4, 20],
    [5, 5], [5, 21], [6, 5], [6, 21], [7, 7], [7, 23], [8, 7], [8, 23],
    [9, 7], [9, 23], [10, 8], [10, 23], [11, 7], [11, 22], [12, 7], [12, 22],
  ],
  2027: [
    [1, 5], [1, 20], [2, 4], [2, 19], [3, 6], [3, 21], [4, 5], [4, 20],
    [5, 6], [5, 21], [6, 6], [6, 21], [7, 7], [7, 23], [8, 8], [8, 23],
    [9, 8], [9, 23], [10, 8], [10, 23], [11, 7], [11, 22], [12, 7], [12, 22],
  ],
};

const pad = (value) => String(value).padStart(2, "0");

test("三年共 72 个节气都落在正确日期", () => {
  let checked = 0;
  for (const [year, days] of Object.entries(EXPECTED)) {
    days.forEach(([month, day], index) => {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      assert.equal(solarTermOn(date), NAMES[index], `${date} 应该是 ${NAMES[index]}`);
      checked += 1;
    });
  }
  assert.equal(checked, 72);
});

test("每年的节气日期互不相同，一共 24 个", () => {
  for (const [year, days] of Object.entries(EXPECTED)) {
    const keys = days.map(([month, day]) => `${year}-${pad(month)}-${pad(day)}`);
    assert.equal(new Set(keys).size, 24, `${year} 有重复日期`);
    for (const key of keys) assert.ok(solarTermOn(key), `${key} 没有节气`);
  }
});

test("普通日子和范围外的年份没有节气", () => {
  assert.equal(solarTermOn("2026-11-19"), null);
  assert.equal(solarTermOn("2026-02-05"), null);
  assert.equal(solarTermOn("2024-12-21"), null);
  assert.equal(solarTermOn("2028-12-21"), null);
});

test("纪念日按月和日对上", () => {
  assert.equal(memorialOn("2026-03-08"), "womensDay");
  assert.equal(memorialOn("2026-09-10"), "teachersDay");
  assert.equal(memorialOn("2026-12-13"), "memorialDay");
  assert.equal(memorialOn("2026-11-19"), null);
});

test("每个纪念日都有文案", () => {
  const keys = ["01-10", "03-08", "05-04", "06-01", "08-01", "09-10", "12-04", "12-13"]
    .map((suffix) => memorialOn(`2026-${suffix}`));

  for (const key of keys) {
    assert.ok(key, "每个样例日期都应该对应一个纪念日");
    for (const text of [zhCN, en]) assert.ok(text.memorialNames[key], `${key} 缺少文案`);
  }
});
