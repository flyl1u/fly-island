import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppearanceSettingsPage } from "./AppearanceSettingsPage";
import { DEFAULT_SETTINGS_CATEGORY, type SettingsCategory } from "./categories";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import { AgentSettingsPage } from "./AgentSettingsPage";
import { AgentAlertsSettingsPage } from "./AgentAlertsSettingsPage";
import { AgentConnectSettingsPage } from "./AgentConnectSettingsPage";
import { AgentApprovalSettings } from "../../features/agent-status/approvals/AgentApprovalSettings";
import { SoundSettingsSection } from "../../features/agent-status/sounds/SoundSettingsSection";
import { ClipboardSettingsPage } from "./ClipboardSettingsPage";
import { LayoutEditor } from "./LayoutEditor";
import { MusicSettingsPage } from "./MusicSettingsPage";
import { CalendarSettingsPage } from "./CalendarSettingsPage";
import { ShelfSettingsPage } from "./ShelfSettingsPage";
import { ShortcutsSettingsPage } from "./ShortcutsSettingsPage";
import { MessagesSettingsPage } from "./MessagesSettingsPage";
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
import { AboutSettingsPage } from "./AboutSettingsPage";
import { PluginsSettingsPage, type PluginsTab } from "./PluginsSettingsPage";
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
    if (section === "calendar") setCategory("calendar");
    if (section === "mail") setCategory("messages");
    if (section === "updates") setCategory("about");
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
  // The market's Manage opens that plugin under Installed; any other way there shows the list.
  const [managedPluginId, setManagedPluginId] = useState<string | null>(null);
  const [pluginsTab, setPluginsTab] = useState<PluginsTab>("installed");
  const changeCategory = (next: typeof category) => {
    setManagedPluginId(null);
    setPluginsTab("installed");
    setCategory(next);
  };
  const changePluginsTab = (tab: PluginsTab) => {
    setManagedPluginId(null);
    setPluginsTab(tab);
  };
  const managePlugin = (id: string) => {
    setManagedPluginId(id);
    setPluginsTab("installed");
  };

  return (
    <main className={`settings-stage stage--font-${settings.fontFamily}`}>
      <LayoutEditor
        category={category}
        onCategoryChange={changeCategory}
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
        {category === "messages" && (
          <MessagesSettingsPage settings={settings} qqNotifications={qqNotifications} wechatReminders={wechatReminders} onSettingsChange={setSettings} />
        )}
        {category === "translation" && <TranslationSettingsPage settings={settings} onSettingsChange={setSettings} onOpenShortcuts={openShortcuts} />}
        {category === "clipboard" && <ClipboardSettingsPage settings={settings} onSettingsChange={setSettings} onOpenShortcuts={openShortcuts} />}
        {category === "music" && <MusicSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "shelf" && <ShelfSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "calendar" && <CalendarSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "agents" && <AgentSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "agentAlerts" && <AgentAlertsSettingsPage settings={settings} onSettingsChange={setSettings} />}
        {category === "sounds" && <SoundSettingsSection />}
        {category === "agentApprovals" && <AgentApprovalSettings />}
        {category === "agentConnect" && <AgentConnectSettingsPage />}
        {category === "plugins" && (
          <PluginsSettingsPage tab={pluginsTab} managedPluginId={managedPluginId} onTabChange={changePluginsTab} onManage={managePlugin} />
        )}
        {category === "about" && <AboutSettingsPage onSettingsChange={setSettings} />}
      </LayoutEditor>
    </main>
  );
}
