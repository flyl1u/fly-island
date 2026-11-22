import type { CalendarMarksText } from "../../../i18n/sections/calendarMarks.ts";
import { holidayOn } from "./holidays.ts";
import { lunarDay } from "./lunar.ts";
import { memorialOn } from "./memorials.ts";
import { solarTermOn } from "./solarTerms.ts";

export function calendarMarkOn(date: string, text: CalendarMarksText) {
  const mark = holidayOn(date);
  const work = mark?.kind === "work";
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const rest = !work && (mark?.kind === "off" || weekday === 0 || weekday === 6);
  const holiday = mark?.kind === "off" && mark.name ? text.holidayNames[mark.name] : null;
  const memorial = memorialOn(date);
  const caption = holiday ?? solarTermOn(date, text.solarTermNames)
    ?? (memorial ? text.memorialNames[memorial] : null) ?? lunarDay(date, text.lunar);
  const badge = work ? text.work : mark?.kind === "off" ? text.off : null;
  const spoken = [caption, work ? text.workLabel : rest ? text.offLabel : null].filter(Boolean).join(text.separator);
  return { caption, badge, rest, work, spoken };
}
