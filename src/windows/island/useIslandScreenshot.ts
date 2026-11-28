import { useEffect } from "react";
import { setNativePluginEnabled, useNativePlugins } from "../../features/plugins/native";
import { configureScreenshotPlugin } from "../../features/screenshot/api";
import { updateScreenshotSettings, useScreenshotSettings } from "../../features/screenshot/useScreenshotSettings";

/** Only the main window reconciles persisted preferences with the native lifecycle. */
export function useIslandScreenshot() {
  const enabled = useNativePlugins().screenshot;
  const { shortcut, shortcutEnabled } = useScreenshotSettings();
  useEffect(() => {
    let disposed = false;
    void configureScreenshotPlugin(enabled, shortcutEnabled ? shortcut : "")
      .catch((error: unknown) => {
        if (disposed || !enabled) return;
        updateScreenshotSettings({ shortcutIssue: { shortcut, reason: String(error) } });
        setNativePluginEnabled("screenshot", false);
      });
    return () => { disposed = true; };
  }, [enabled, shortcut, shortcutEnabled]);
}
