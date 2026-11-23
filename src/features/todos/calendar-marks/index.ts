import type { CalendarMarksText } from "../../../i18n/sections/calendarMarks.ts";
import { holidayOn } from "./holidays.ts";
import { lunarDay } from "./lunar.ts";
import { memorialOn } from "./memorials.ts";
import { solarTermOn } from "./solarTerms.ts";

export function calendarMarkOn(date: string, text: CalendarMarksText) {
  const mark = holidayOn(date);
  const work = mark?.kind === "work";
  const off = mark?.kind === "off";
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const rest = !work && (off || weekday === 0 || weekday === 6);
  const holiday = off && mark.name ? text.holidayNames[mark.name] : null;
  const memorial = memorialOn(date);
  const occasion = holiday ?? solarTermOn(date, text.solarTermNames)
    ?? (memorial ? text.memorialNames[memorial] : null);
  const lunar = lunarDay(date, text.lunar);
  const caption = work ? text.work : off ? holiday ?? text.off : occasion ?? lunar;
  const tone = work ? "work" : off ? "off" : occasion ? "occasion" : "lunar";
  const status = work ? text.workLabel : off ? text.offLabel : null;
  const detail = [occasion, lunar, status].filter(Boolean).join(text.separator);
  const spoken = [occasion, lunar, status ?? (rest ? text.offLabel : null)].filter(Boolean).join(text.separator);
  return { caption, tone, rest, detail, spoken };
}
