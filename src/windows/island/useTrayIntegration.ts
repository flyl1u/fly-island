import { useEffect } from "react";
import { useLocale } from "../../i18n";
import { checkForUpdate } from "../../features/updater/updaterController";
import { listenTrayCheckUpdates, listenTrayVisibilityChanged, openSettingsWindow, setTrayLanguage, setTrayVisible } from "../settings/api";
import { loadTrayVisible, saveTrayVisible, TRAY_VISIBLE_CHANGED_EVENT, TRAY_VISIBLE_STORAGE_KEY } from "../settings/storage";

/** The main webview owns startup sync even when Settings has never been opened. */
export function useTrayIntegration() {
  const { locale } = useLocale();
  useEffect(() => {
    void setTrayLanguage(locale).catch((error) => console.error("Failed to set tray language", error));
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let requested: boolean | undefined;
    const sync = () => {
      const visible = loadTrayVisible();
      if (requested === visible) return;
      requested = visible;
      void setTrayVisible(visible).catch((error) => {
        requested = undefined;
        console.error("Failed to set tray visibility", error);
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TRAY_VISIBLE_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TRAY_VISIBLE_CHANGED_EVENT, sync);
    // Subscribe before revealing the tray, so its first Hide action cannot be lost.
    void listenTrayVisibilityChanged((visible) => {
      if (cancelled) return;
      requested = visible;
      saveTrayVisible(visible);
    }).then((stop) => {
      if (cancelled) stop();
      else { unlisten = stop; sync(); }
    }).catch((error) => {
      console.error("Failed to listen for tray visibility", error);
      if (!cancelled) sync();
    });
    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TRAY_VISIBLE_CHANGED_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenTrayCheckUpdates(() => {
      if (cancelled) return;
      openSettingsWindow("updates");
      void checkForUpdate().catch((error) => console.error("Failed to check for updates from tray", error));
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    }).catch((error) => console.error("Failed to listen for tray update requests", error));
    return () => { cancelled = true; unlisten?.(); };
  }, []);
}
