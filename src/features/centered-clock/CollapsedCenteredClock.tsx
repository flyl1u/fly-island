import { useEffect, useState } from "react";
import { useLocale, useTranslation } from "../../i18n";
import { formatCenteredClock, getCenteredClockParts, nextClockDelay, type CenteredClockSettings } from "./model.ts";
import "./CollapsedCenteredClock.css";

/** Updates at the next minute or second boundary, only while the idle clock is visible. */
export function CollapsedCenteredClock({ active, settings, className = "" }: {
  active: boolean; settings: CenteredClockSettings; className?: string;
}) {
  const { locale } = useLocale();
  const t = useTranslation().settings.plugins.centeredClock;
  const [now, setNow] = useState(() => new Date());
  const display = formatCenteredClock(now, settings, locale);
  const parts = getCenteredClockParts(now, settings, locale);
  const date = [parts.weekday, parts.date].filter(Boolean).join(" ");
  const dateContent = date && <span className="collapsed-centered-clock__date">
    {parts.weekday && <span className="collapsed-centered-clock__weekday">{parts.weekday}</span>}
    {parts.date && <span className="collapsed-centered-clock__date-value">{parts.date}</span>}
  </span>;
  const timeContent = settings.showTime && <span className="collapsed-centered-clock__time-group">
    <span className="collapsed-centered-clock__time">{parts.time}</span>
    {(parts.seconds || parts.period) && <span className="collapsed-centered-clock__precision">
      {parts.seconds && <span className="collapsed-centered-clock__seconds">{parts.seconds}</span>}
      {parts.period && <span className="collapsed-centered-clock__period">{parts.period}</span>}
    </span>}
  </span>;

  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      const timestamp = Date.now();
      setNow(new Date(timestamp));
      timer = window.setTimeout(update, nextClockDelay(timestamp, settings.showTime && settings.showSeconds));
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active, locale, settings]);

  return <time
    className={("collapsed-centered-clock" + (settings.showTime ? "" : " collapsed-centered-clock--date-only") + " " + className).trim()}
    dateTime={now.toISOString()}
    aria-label={t.timeLabel(display)}
  >{settings.dateFirst && dateContent}{timeContent}{!settings.dateFirst && dateContent}</time>;
}
