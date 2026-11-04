import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppearanceSettingsPage } from "./AppearanceSettingsPage";
import { DEFAULT_SETTINGS_CATEGORY, type SettingsCategory } from "./categories";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import { IntegrationsSettingsPage } from "./IntegrationsSettingsPage";
import { LayoutEditor } from "./LayoutEditor";
import { NotificationsSettingsPage } from "./NotificationsSettingsPage";
import { SETTINGS_FOCUS_STORAGE_KEY, takeFocusRequest } from "./storage";
import { DEFAULT_SETTINGS, isSameSettings } from "../../features/appearance/settings";
import { STORAGE_KEY, loadSettings, saveSettings } from "../../features/appearance/storage";
import type { IslandSettings } from "../../features/appearance/types";
import { useSettingPresets } from "../../features/appearance/useSettingPresets";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { ProjectSettingsSection } from "../../features/updater/ProjectSettingsSection";
import { useLocale, useTranslation } from "../../i18n";
import "./SettingsWindow.css";

export function SettingsWindow() {
  const t = useTranslation();
  const { locale, setLocale } = useLocale();
  const qqNotifications = useQQNotifications(false);
  const wechatReminders = useWeChatReminders(false);
  const [settings, setSettings] = useState<IslandSettings>(loadSettings);
  const presets = useSettingPresets(settings, setSettings);
  const saveDirectory = useSaveDirectorySetting();
  const [category, setCategory] = useState<SettingsCategory>(DEFAULT_SETTINGS_CATEGORY);
  const highlightSaveDirectory = saveDirectory.highlight;

  // The island asks for the save path when an export has nowhere to go; it lives on the general page.
  const focusSavePath = useCallback(() => {
    setCategory("general");
    highlightSaveDirectory();
  }, [highlightSaveDirectory]);

  useEffect(() => {
    void getCurrentWindow()
      .setTitle(`fly-island ${t.settings.title}`)
      .catch((error) => {
        console.error("Failed to set settings window title", error);
      });
  }, [t]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (takeFocusRequest() === "savePath") {
      focusSavePath();
    }

    const syncFromIsland = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) =>
          isSameSettings(current, nextSettings) ? current : nextSettings,
        );
      }

      if (
        event.key === SETTINGS_FOCUS_STORAGE_KEY &&
        event.newValue !== null &&
        takeFocusRequest() === "savePath"
      ) {
        focusSavePath();
      }
    };

    window.addEventListener("storage", syncFromIsland);
    return () => window.removeEventListener("storage", syncFromIsland);
  }, [focusSavePath]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return (
    <main className={`settings-stage stage--font-${settings.fontFamily}`}>
      <LayoutEditor
        category={category}
        onCategoryChange={setCategory}
        onReset={resetSettings}
      >
        {category === "general" && (
          <GeneralSettingsPage
            locale={locale}
            settings={settings}
            saveDirectory={saveDirectory}
            onLocaleChange={setLocale}
            onSettingsChange={setSettings}
          />
        )}
        {category === "appearance" && (
          <AppearanceSettingsPage
            settings={settings}
            presets={presets}
            onSettingsChange={setSettings}
          />
        )}
        {category === "notifications" && (
          <NotificationsSettingsPage
            qqNotifications={qqNotifications}
            wechatReminders={wechatReminders}
          />
        )}
        {category === "integrations" && <IntegrationsSettingsPage />}
        {category === "about" && <ProjectSettingsSection />}
      </LayoutEditor>
    </main>
  );
}
