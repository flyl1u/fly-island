import { useEffect } from "react";
import { useLocale } from "../../i18n";
import { setTrayLanguage } from "./api";

/** Keeps the tray menu (src-tauri/src/tray.rs) in the island's language, also after it changes in Settings. */
export function useTrayLanguage() {
  const { locale } = useLocale();
  useEffect(() => {
    setTrayLanguage(locale).catch((error: unknown) => console.error("Failed to set the tray menu's language", error));
  }, [locale]);
}
