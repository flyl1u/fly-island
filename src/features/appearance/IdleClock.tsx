import { useEffect, useState } from "react";
import { useLocale } from "../../i18n";
import { formatIdleClock, idleClockTickMs, type IdleClockSettings } from "./idleClockSettings";
import "./IdleClock.css";

/** Only this leaf ticks; an expanded, tucked or covered clock has no timer. */
export function IdleClock({ settings, active = true }: { settings: IdleClockSettings; active?: boolean }) {
  const { locale } = useLocale();
  const [now, setNow] = useState(() => new Date());
  const interval = idleClockTickMs(settings);
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      setNow(new Date());
      if (!document.hidden) timer = window.setTimeout(refresh, interval - Date.now() % interval + 10);
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [active, interval]);
  const text = formatIdleClock(now, settings, locale);
  return <time className="island-idle-clock" dateTime={now.toISOString()} aria-label={text} aria-live="off">{text}</time>;
}
