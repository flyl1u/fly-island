import { useCallback, useEffect, useState, type ComponentType } from "react";
import { AppearanceSettingsPage } from "./AppearanceSettingsPage";
import { DEFAULT_SETTINGS_CATEGORY, type SettingsCategory } from "./categories";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import { AgentSettingsPage } from "./AgentSettingsPage";
import { AgentConnectSettingsPage } from "./AgentConnectSettingsPage";
import { ClipboardSettingsPage } from "./ClipboardSettingsPage";
import { LayoutEditor } from "./LayoutEditor";
import { MusicSettingsPage } from "./MusicSettingsPage";
import { MessagesSettingsPage } from "./MessagesSettingsPage";
import { PluginsSettingsPage } from "./PluginsSettingsPage";
import { ClockWeatherSettingsPage } from "./ClockWeatherSettingsPage";
import { SETTINGS_FOCUS_STORAGE_KEY, takeFocusRequest, requestPanelPreview } from "./storage";
import { TodosSettingsPage } from "./TodosSettingsPage";
import { TranslationSettingsPage } from "./TranslationSettingsPage";
import { AboutSettingsPage } from "./AboutSettingsPage";
import { DEFAULT_SETTINGS, withAppearanceFrom } from "../../features/appearance/settings";
import { ResetAppearanceButton } from "../../features/appearance/ResetAppearanceButton";
import { withColorBackup } from "../../features/appearance/storage";
import type { IslandSettings } from "../../features/appearance/types";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { useLocale } from "../../i18n";
import { NATIVE_PLUGINS, useNativePlugins } from "../../features/plugins/native";

const STANDALONE_SETTINGS_PAGES: Partial<Record<SettingsCategory, ComponentType>> = {
  clockWeather: ClockWeatherSettingsPage,
};

/**
 * Every settings page with its sidebar. Shown as a page of the island or in the
 * standalone settings window; the host owns the settings and where they are saved.
 */
export function SettingsPanel({
  settings,
  onSettingsChange,
  qqNotifications,
  wechatReminders,
  detached,
  onDetachedChange,
  onContentHeight,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings | ((current: IslandSettings) => IslandSettings)) => void;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  /** Whether settings open in their own window (General → Separate settings window). */
  detached: boolean;
  onDetachedChange: (detached: boolean) => void;
  /** As a page of the island: told the height the open page needs, to size the island to it. */
  onContentHeight?: (height: number) => void;
}) {
  const { locale, setLocale } = useLocale();
  const setSettings = onSettingsChange;
  const saveDirectory = useSaveDirectorySetting();
  const [category, setCategory] = useState<SettingsCategory>(DEFAULT_SETTINGS_CATEGORY);
  const nativePlugins = useNativePlugins();
  const standaloneCategories = new Set(
    NATIVE_PLUGINS.filter((plugin) => plugin.settings?.standalone).map((plugin) => plugin.settings?.category),
  );
  const installedStandaloneCategories = new Set(
    NATIVE_PLUGINS.filter((plugin) => plugin.settings?.standalone && nativePlugins[plugin.id]).map((plugin) => plugin.settings?.category),
  );
  const activeCategory = standaloneCategories.has(category) && !installedStandaloneCategories.has(category) ? "plugins" : category;
  const highlightSaveDirectory = saveDirectory.highlight;

  useEffect(() => {
    if (activeCategory !== category) setCategory(activeCategory);
  }, [activeCategory, category]);

  // The island asks for the save path when an export has nowhere to go; it lives on the todos page.
  const focusSavePath = useCallback(() => {
    setCategory("todos");
    highlightSaveDirectory();
  }, [highlightSaveDirectory]);
  // A part of the island (or the translation window) asked for one of the pages.
  const focusRequestedSection = useCallback(() => {
    const section = takeFocusRequest();
    if (section === "savePath") focusSavePath();
    if (section === "translation") setCategory("translation");
    if (section === "music") setCategory("music");
    if (section === "mail") setCategory("messages");
    if (section === "updates") setCategory("about");
  }, [focusSavePath]);

  useEffect(() => {
    focusRequestedSection();
    const onRequest = (event: StorageEvent) => {
      if (event.key === SETTINGS_FOCUS_STORAGE_KEY && event.newValue !== null) focusRequestedSection();
    };
    window.addEventListener("storage", onRequest);
    return () => window.removeEventListener("storage", onRequest);
  }, [focusRequestedSection]);

  const resetAppearance = useCallback(() => {
    const next = withColorBackup(settings, withAppearanceFrom(settings, DEFAULT_SETTINGS));
    setSettings(next);
    if (next !== settings) requestPanelPreview("collapsed");
  }, [settings, setSettings]);

  return (
    <LayoutEditor
      key={activeCategory}
      category={activeCategory}
      onCategoryChange={setCategory}
      onContentHeight={onContentHeight}
      titleAction={activeCategory === "appearance" && <ResetAppearanceButton onReset={resetAppearance} />}
    >
      {activeCategory === "general" && (
        <GeneralSettingsPage
          locale={locale}
          settings={settings}
          detachedSettings={detached}
          onLocaleChange={setLocale}
          onSettingsChange={setSettings}
          onDetachedSettingsChange={onDetachedChange}
        />
      )}
      {activeCategory === "appearance" && (
        <AppearanceSettingsPage settings={settings} onSettingsChange={setSettings} />
      )}
      {activeCategory === "todos" && (
        <TodosSettingsPage
          settings={settings}
          saveDirectory={saveDirectory}
          onSettingsChange={setSettings}
        />
      )}
      {activeCategory === "messages" && (
        <MessagesSettingsPage settings={settings} qqNotifications={qqNotifications} wechatReminders={wechatReminders} onSettingsChange={setSettings} />
      )}
      {activeCategory === "translation" && <TranslationSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {activeCategory === "clipboard" && <ClipboardSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {activeCategory === "music" && <MusicSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {activeCategory === "agents" && <AgentSettingsPage settings={settings} onSettingsChange={setSettings} onOpenConnect={() => setCategory("agentConnect")} />}
      {activeCategory === "agentConnect" && <AgentConnectSettingsPage />}
      {(() => {
        const Page = STANDALONE_SETTINGS_PAGES[activeCategory];
        return Page ? <Page /> : null;
      })()}
      {activeCategory === "plugins" && <PluginsSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {activeCategory === "about" && <AboutSettingsPage />}
    </LayoutEditor>
  );
}
