#!/usr/bin/env node
/**
 * 检查节假日数据覆盖到哪一年，供维护时手动运行。
 *
 * 不参与 `pnpm check`，也永远以 0 退出：结果取决于当天日期，如果让它在每年 11 月后
 * 失败，所有贡献者的提交前检查都会被一个与本次改动无关的原因卡住。
 *
 * 用法：node scripts/check-holidays.mjs [年份] [月份]，不带参数时按当天判断。
 */
import { COVERED_YEARS } from "../src/features/todos/calendar-marks/holidays.ts";

const now = new Date();
const argYear = Number(process.argv[2]);
const argMonth = Number(process.argv[3]);
const year = argYear > 0 ? argYear : now.getFullYear();
const month = argMonth > 0 ? argMonth - 1 : now.getMonth();

// 11 月起该有次年数据了；1–10 月只要求当年。
const expected = month >= 10 ? [year, year + 1] : [year];
const missing = expected.filter((each) => !COVERED_YEARS.includes(each));

if (missing.length > 0) {
  console.warn(`提示：节假日数据还没有 ${missing.join("、")} 年，补法见 docs/holidays.md。`);
} else {
  console.log(`节假日数据已覆盖：${COVERED_YEARS.join("、")}`);
}

// 始终成功退出，见文件头部的说明。
process.exitCode = 0;
