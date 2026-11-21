import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { formatClock, nextMinuteDelay } from "./model";
import "./CollapsedClock.css";

/** Ticks at the next whole minute; no ticking state is lifted to the island window. */
export function CollapsedClock({ active }: { active: boolean }) {
  const [time, setTime] = useState(() => formatClock(new Date()));
  const t = useTranslation().settings.plugins.clockWeather;
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      setTime(formatClock(new Date()));
      timer = window.setTimeout(update, nextMinuteDelay(Date.now()));
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active]);
  return <time className="collapsed-clock" aria-label={t.timeLabel(time)}>{time}</time>;
}
