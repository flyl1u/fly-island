import { useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useIslandSettings } from "../../features/appearance/useIslandSettings";
import { useDocumentTheme, useSystemIsDark } from "../../features/appearance/useDocumentTheme";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";
import { dockSettingsWindow, setSettingsWindowTheme, showSettingsWindow } from "./api";
import { saveDetachedSettings } from "./storage";
import { SettingsPanel } from "./SettingsPanel";
import { useSettingsPresentation } from "./useSettingsPresentation";
import "./SettingsWindow.css";

/** The standalone settings window, used when General → Separate settings window is on. */
export function SettingsWindow() {
  const t = useTranslation();
  const [settings, setSettings] = useIslandSettings();
  const qqNotifications = useQQNotifications(false);
  const wechatReminders = useWeChatReminders(false, { restore: false });
  const detached = useSettingsPresentation();
  const scheme = useDocumentTheme(settings.colorScheme);
  const systemDark = useSystemIsDark();

  // The native title bar and background follow the page. Windows redraws the title bar in its own
  // mode when that changes, so a change of the system mode paints it again too.
  useEffect(() => {
    void setSettingsWindowTheme(scheme === "dark").catch((error) => {
      console.error("Failed to set settings window theme", error);
    });
  }, [scheme, systemDark]);

  // The window opens hidden and is shown once the page has rendered, so it never shows
  // empty. A hidden webview may not run animation frames at all, so then the rendered
  // DOM is enough; otherwise wait two frames (the first runs before its paint).
  useEffect(() => {
    const show = () => {
      void showSettingsWindow().catch((error) => {
        console.error("Failed to show settings window", error);
      });
    };
    if (document.visibilityState === "hidden") {
      show();
      return;
    }
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(show);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  useEffect(() => {
    void getCurrentWindow()
      .setTitle(`fly-island ${t.settings.title}`)
      .catch((error) => {
        console.error("Failed to set settings window title", error);
      });
  }, [t]);

  // Switching the window off moves settings back into the island and closes this window.
  const changePresentation = useCallback(async (nextDetached: boolean) => {
    if (!saveDetachedSettings(nextDetached) || nextDetached) return;
    try {
      await dockSettingsWindow();
    } catch (error) {
      saveDetachedSettings(true);
      console.error("Failed to move settings into the island", error);
    }
  }, []);

  return (
    <main className={`settings-stage stage--font-${settings.fontFamily}`}>
      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        qqNotifications={qqNotifications}
        wechatReminders={wechatReminders}
        detached={detached}
        onDetachedChange={(value) => void changePresentation(value)}
      />
    </main>
  );
}
