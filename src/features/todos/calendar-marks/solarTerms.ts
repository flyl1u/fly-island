import { zhCN } from "../../../i18n/sections/calendarMarks.ts";

/**
 * 二十四节气，只登记 2025–2027 三年。
 *
 * 日期按**北京时间**取自日本国立天文台的《暦要項》二十四节气表（中央标准时减 1 小时，
 * 跨越零点的按前一天算）。通用近似公式在跨日边界会差一天——2026 年芒种实际是 6 月 5 日
 * 23:48（北京），公式会算成 6 月 6 日——所以这里用查表，不用公式。
 *
 * 加一年：把该年的 24 个日期按「小寒 … 冬至」的顺序追加成一行。
 */
/** 每年的 24 个 [月, 日]，顺序与 TERM_NAMES 一致。 */
const TABLES: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
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

/** 有节气数据的年份，供测试遍历。 */
export const TERM_YEARS: readonly number[] = Object.keys(TABLES).map(Number);

/** 二十四节气的名字，顺序从小寒到冬至。 */
export const SOLAR_TERM_NAMES = zhCN.solarTermNames;

/** 某一天是哪个节气，没有则返回 null。 */
export function solarTermOn(date: string, names: readonly string[] = SOLAR_TERM_NAMES): string | null {
  const [year, month, day] = date.split("-").map(Number);
  const table = TABLES[year];
  if (!table) return null;
  for (let index = 0; index < table.length; index += 1) {
    const [termMonth, termDay] = table[index];
    if (termMonth === month && termDay === day) return names[index];
  }
  return null;
}
