import { holidayOn } from "./holidays";
import { lunarDay } from "./lunar";
import { memorialOn } from "./memorials";
import { solarTermOn } from "./solarTerms";
import { TEXT } from "./text";
import "./calendar-marks.css";

/**
 * 日历标记插件：在月历的号码下面多一行，标出中国法定节假日、调休、二十四节气、
 * 纪念日和农历；休息日加红底和「休」角标。
 *
 * 这是插件的全部内容，`TodoCalendar.tsx` 只引用本文件的三处（见 PR 的接入点说明）。
 * 不装插件时不引用本文件，月历与上游完全一致。
 */
export type CalendarMark = {
  /** 号码下面那一行：节日名、节气、纪念日或农历日。 */
  caption: string | null;
  /** 右上角角标：今 / 休 / 班。 */
  badge: string | null;
  /** 按休息日标红（周末与法定节假日，调休上班除外）。 */
  rest: boolean;
  /** 调休上班的周末。 */
  work: boolean;
  /** 读屏在日期后面补的一句。 */
  spoken: string | null;
};

/** 插件只在中文界面出现，英文界面按未安装处理。 */
export function calendarMarksEnabled(localeTag: string) {
  return localeTag.startsWith("zh");
}

/**
 * 某一天在月历上的样子。`enabled` 为 false 时返回 null，
 * 调用方应当渲染成没有插件时的样子。
 */
export function calendarMarkOn(date: string, today: string, enabled: boolean): CalendarMark | null {
  if (!enabled) return null;

  const mark = holidayOn(date);
  const work = mark?.kind === "work";
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const rest = !work && (mark?.kind === "off" || weekday === 0 || weekday === 6);

  const holidayName = mark?.kind === "off" && mark.name ? TEXT.holidayNames[mark.name] ?? mark.name : null;
  const memorialKey = memorialOn(date);
  const caption = holidayName
    ?? solarTermOn(date)
    ?? (memorialKey ? TEXT.memorialNames[memorialKey] ?? memorialKey : null)
    ?? lunarDay(date);

  const badge = date === today ? TEXT.today : rest ? TEXT.off : work ? TEXT.work : null;

  // 读屏念的是这一天是什么日子，与有没有角标无关：普通工作日的今天不该念成「休」。
  const spoken = holidayName ?? (work ? TEXT.work : rest ? TEXT.off : null);

  return { caption, badge, rest, work, spoken };
}
