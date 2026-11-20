#!/usr/bin/env node
/**
 * 每年 11 月国务院办公厅发布次年的节假日安排（2024–2026 都是 11 月上旬）。
 * 这里把「数据必须覆盖到哪一年」变成一条可以失败的检查，避免跨年后日历悄悄没有标记。
 * 补数据的步骤见 docs/holidays.md。
 *
 * 用法：node scripts/check-holidays.mjs [年份] [月份]，不带参数时按当天判断。
 */
import { COVERED_YEARS } from "../src/features/todos/holidays.ts";

const now = new Date();
const argYear = Number(process.argv[2]);
const argMonth = Number(process.argv[3]);
const year = argYear > 0 ? argYear : now.getFullYear();
const month = argMonth > 0 ? argMonth - 1 : now.getMonth();

// 11 月起要求次年数据；1–10 月只要求当年。
const required = month >= 10 ? [year, year + 1] : [year];
const missing = required.filter((each) => !COVERED_YEARS.includes(each));

if (missing.length > 0) {
  console.error(`节假日数据缺少 ${missing.join("、")} 年，按 docs/holidays.md 补上后重跑。`);
  process.exit(1);
}

console.log(`节假日数据已覆盖：${COVERED_YEARS.join("、")}`);
