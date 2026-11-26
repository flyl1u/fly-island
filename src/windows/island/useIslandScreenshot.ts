import { useEffect } from "react";
import { useNativePlugins } from "../../features/plugins/native";
import { configureScreenshotPlugin } from "../../features/screenshot/api";
import { useScreenshotSettings } from "../../features/screenshot/useScreenshotSettings";

/** Only the main window reconciles persisted preferences with the native lifecycle. */
export function useIslandScreenshot() {
  const enabled = useNativePlugins().screenshot;
  const { shortcut, shortcutEnabled } = useScreenshotSettings();
  useEffect(() => {
    void configureScreenshotPlugin(enabled, shortcutEnabled ? shortcut : "")
      .catch((error) => console.error("Screenshot plugin configuration failed", error));
  }, [enabled, shortcut, shortcutEnabled]);
}
