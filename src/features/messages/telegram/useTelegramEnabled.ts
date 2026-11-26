import { useCallback, useEffect, useState } from "react";
import { useNativePlugins } from "../../plugins";
import { isTelegramEnabled, saveTelegramEnabled, TELEGRAM_ENABLED_KEY } from "./storage";

/** The receive switch, saved and kept in step across windows. */
export function useTelegramEnabled(): [boolean, (enabled: boolean) => boolean] {
  const [enabled, setEnabled] = useState(isTelegramEnabled);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === TELEGRAM_ENABLED_KEY) setEnabled(isTelegramEnabled());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const save = useCallback((on: boolean) => {
    const saved = saveTelegramEnabled(on);
    setEnabled(isTelegramEnabled());
    return saved;
  }, []);
  return [enabled, save];
}

/** Whether Telegram should be received: its plugin installed and on, and its switch on. */
export function useTelegramWanted(): boolean {
  const installed = useNativePlugins();
  const [enabled] = useTelegramEnabled();
  return installed.telegram && enabled;
}
