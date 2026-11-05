import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppearanceSettingsPage } from "./AppearanceSettingsPage";
import { DEFAULT_SETTINGS_CATEGORY, type SettingsCategory } from "./categories";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import { AgentSettingsPage } from "./AgentSettingsPage";
import { ClipboardSettingsPage } from "./ClipboardSettingsPage";
import { LayoutEditor } from "./LayoutEditor";
import { MusicSettingsPage } from "./MusicSettingsPage";
import { ShelfSettingsPage } from "./ShelfSettingsPage";
import { ShortcutsSettingsPage } from "./ShortcutsSettingsPage";
import { MailSettingsPage } from "./MailSettingsPage";
import { QQSettingsPage } from "./QQSettingsPage";
import { WeChatSettingsPage } from "./WeChatSettingsPage";
import { SETTINGS_FOCUS_STORAGE_KEY, takeFocusRequest } from "./storage";
import { showSettingsWindow } from "./api";
import { TodosSettingsPage } from "./TodosSettingsPage";
import { TranslationSettingsPage } from "./TranslationSettingsPage";
import { DEFAULT_SETTINGS, isSameSettings, withAppearanceFrom } from "../../features/appearance/settings";
import { STORAGE_KEY, loadSettings, saveSettings } from "../../features/appearance/storage";
import { ResetAppearanceButton } from "../../features/appearance/ResetAppearanceButton";
import type { IslandSettings } from "../../features/appearance/types";
import { useSettingPresets } from "../../features/appearance/useSettingPresets";
import { useQQNotifications } from "../../features/messages/qq-notifications/QQNotifications";
import { useWeChatReminders } from "../../features/messages/wechat/WeChatReminders";
import { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { ProjectSettingsSection } from "../../features/updater/ProjectSettingsSection";
import { PluginMarketSection } from "../../features/plugins/PluginMarketSection";
import { PluginsSettingsSection } from "../../features/plugins/PluginsSettingsSection";
import { PluginDevSection } from "../../features/plugin-dev/PluginDevSection";
import { PluginIslandPagesSection } from "../../features/plugin-views/PluginIslandPagesSection";
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

  // The island asks for the save path when an export has nowhere to go; it lives on the todos page.
  const focusSavePath = useCallback(() => {
    setCategory("todos");
    highlightSaveDirectory();
  }, [highlightSaveDirectory]);
  // The translation window's settings button opens its page here.
  const focusRequestedSection = useCallback(() => {
    const section = takeFocusRequest();
    if (section === "savePath") focusSavePath();
    if (section === "translation") setCategory("translation");
    if (section === "music") setCategory("music");
  }, [focusSavePath]);

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

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    focusRequestedSection();

    const syncFromIsland = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const nextSettings = loadSettings();
        setSettings((current) =>
          isSameSettings(current, nextSettings) ? current : nextSettings,
        );
      }

      if (event.key === SETTINGS_FOCUS_STORAGE_KEY && event.newValue !== null) {
        focusRequestedSection();
      }
    };

    window.addEventListener("storage", syncFromIsland);
    return () => window.removeEventListener("storage", syncFromIsland);
  }, [focusRequestedSection]);

  const resetAppearance = useCallback(() => {
    setSettings((current) => withAppearanceFrom(current, DEFAULT_SETTINGS));
  }, []);

  const openShortcuts = () => setCategory("shortcuts");

  return (
    <main className={`settings-stage stage--font-${settings.fontFamily}`}>
      <LayoutEditor
        category={category}
        onCategoryChange={setCategory}
        titleAction={category === "appearance" && <ResetAppearanceButton onReset={resetAppearance} />}
      >
        {category === "general" && (
          <GeneralSettingsPage
            locale={locale}
            settings={settings}
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
        {category === "shortcuts" && <ShortcutsSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "todos" && (
          <TodosSettingsPage
            settings={settings}
            saveDirectory={saveDirectory}
            onSettingsChange={setSettings}
          />
        )}
        {category === "qq" && <QQSettingsPage qqNotifications={qqNotifications} />}
        {category === "wechat" && <WeChatSettingsPage wechatReminders={wechatReminders} />}
        {category === "mail" && <MailSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "translation" && <TranslationSettingsPage settings={settings} onSettingsChange={setSettings} onOpenShortcuts={openShortcuts} />}
        {category === "clipboard" && <ClipboardSettingsPage settings={settings} onSettingsChange={setSettings} onOpenShortcuts={openShortcuts} />}
        {category === "music" && <MusicSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "shelf" && <ShelfSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "agents" && <AgentSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "plugins" && (
          <>
            <PluginsSettingsSection />
            <PluginIslandPagesSection />
            <PluginDevSection />
          </>
        )}
        {category === "market" && <PluginMarketSection />}
        {category === "about" && <ProjectSettingsSection />}
      </LayoutEditor>
    </main>
  );
}
