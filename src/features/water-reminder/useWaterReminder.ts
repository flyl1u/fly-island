import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { useNativePlugins } from "../plugins/native";
import { WATER_NOTICE_MS } from "./storage";
import { useWaterSettings } from "./useWaterSettings";

type Reminder = { index: number; text: string | null };

export function useWaterReminder(canShow: boolean) {
  const enabled = useNativePlugins()["water-reminder"];
  const { intervalMinutes, messages } = useWaterSettings();
  const defaults = useTranslation().settings.plugins.waterReminder.defaults;
  const phrases = messages.length ? messages : defaults;
  const interval = enabled ? intervalMinutes : null;
  const [previousInterval, setPreviousInterval] = useState(interval);
  const [reminder, setReminder] = useState<Reminder>({ index: 0, text: null });
  const [due, setDue] = useState(false);

  if (previousInterval !== interval) {
    setPreviousInterval(interval);
    setDue(false);
    setReminder({ index: 0, text: null });
  }

  useEffect(() => {
    if (interval === null || due) return;
    const timer = window.setTimeout(() => setDue(true), interval * 60_000);
    return () => window.clearTimeout(timer);
  }, [interval, due, reminder.index]);

  useEffect(() => {
    if (interval === null || !due || !canShow) return;
    const start = window.setTimeout(() => {
      setReminder(({ index }) => ({ index: index + 1, text: phrases[index % phrases.length] }));
      setDue(false);
    }, 0);
    return () => window.clearTimeout(start);
  }, [interval, due, canShow, phrases]);

  useEffect(() => {
    if (reminder.text === null) return;
    const timer = window.setTimeout(() => setReminder(({ index }) => ({ index, text: null })), WATER_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [reminder]);

  return enabled ? reminder.text : null;
}
