import { addCalendarSource, type CalendarSource } from "./api";
import { CHINA_HOLIDAYS_LINK } from "./presets";

/** Whether the holiday calendar is among the added ones (its link's host is Apple's). */
export function hasChinaHolidays(sources: readonly CalendarSource[]) {
  return sources.some((source) => source.kind === "ics" && source.host === new URL(CHINA_HOLIDAYS_LINK).host);
}

/** Subscribes to China's holidays and make-up workdays: one click, no account. */
export function addChinaHolidays(name: string) {
  return addCalendarSource({ kind: "ics", name, url: "", username: "", secret: CHINA_HOLIDAYS_LINK });
}
