import { useCallback, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useIslandSettings } from "../../features/appearance/useIslandSettings";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useTranslation } from "../../i18n";
import { dockSettingsWindow } from "./api";
import { saveDetachedSettings } from "./storage";
import { useSettingsPresentation } from "./useSettingsPresentation";
import { SettingsPanel } from "./SettingsPanel";
import "./SettingsWindow.css";

export function SettingsWindow() {
  const t = useTranslation();
  const [settings, setSettings] = useIslandSettings();
  const qqNotifications = useQQNotifications(false);
  const wechatReminders = useWeChatReminders(false);
  const detached = useSettingsPresentation();
  useEffect(() => {
    void getCurrentWindow().setTitle(`fly-island ${t.settings.title}`)
      .catch((error) => console.error("Failed to set settings window title", error));
  }, [t]);

  const changePresentation = useCallback(async (nextDetached: boolean) => {
    if (!saveDetachedSettings(nextDetached) || nextDetached) return;
    try {
      await dockSettingsWindow();
    } catch (error) {
      saveDetachedSettings(true);
      console.error("Failed to dock settings", error);
    }
  }, []);

  return (
    <main className={`settings-stage stage--font-${settings.fontFamily}`}>
      <SettingsPanel settings={settings} onSettingsChange={setSettings}
        qqNotifications={qqNotifications} wechatReminders={wechatReminders}
        detached={detached} onDetachedChange={(value) => void changePresentation(value)} />
    </main>
  );
}
