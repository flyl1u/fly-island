import { useCallback, useEffect, useState } from "react";
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
import { ShelfSettingsPage } from "./ShelfSettingsPage";
import { MessagesSettingsPage } from "./MessagesSettingsPage";
import { SETTINGS_FOCUS_STORAGE_KEY, takeFocusRequest } from "./storage";
import { TodosSettingsPage } from "./TodosSettingsPage";
import { TranslationSettingsPage } from "./TranslationSettingsPage";
import { AboutSettingsPage } from "./AboutSettingsPage";
import { DEFAULT_SETTINGS, withAppearanceFrom } from "../../features/appearance/settings";
import { ResetAppearanceButton } from "../../features/appearance/ResetAppearanceButton";
import type { IslandSettings } from "../../features/appearance/types";
import { useSettingPresets } from "../../features/appearance/useSettingPresets";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { useLocale } from "../../i18n";

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
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings | ((current: IslandSettings) => IslandSettings)) => void;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  /** Whether settings open in their own window (General → Separate settings window). */
  detached: boolean;
  onDetachedChange: (detached: boolean) => void;
}) {
  const { locale, setLocale } = useLocale();
  const setSettings = onSettingsChange;
  const presets = useSettingPresets(settings, setSettings);
  const saveDirectory = useSaveDirectorySetting();
  const [category, setCategory] = useState<SettingsCategory>(DEFAULT_SETTINGS_CATEGORY);
  const highlightSaveDirectory = saveDirectory.highlight;

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
    setSettings((current) => withAppearanceFrom(current, DEFAULT_SETTINGS));
  }, [setSettings]);

  return (
    <LayoutEditor
      category={category}
      onCategoryChange={setCategory}
      titleAction={category === "appearance" && <ResetAppearanceButton onReset={resetAppearance} />}
    >
      {category === "general" && (
        <GeneralSettingsPage
          locale={locale}
          settings={settings}
          detachedSettings={detached}
          onLocaleChange={setLocale}
          onSettingsChange={setSettings}
          onDetachedSettingsChange={onDetachedChange}
        />
      )}
      {category === "appearance" && (
        <AppearanceSettingsPage
          settings={settings}
          presets={presets}
          onSettingsChange={setSettings}
        />
      )}
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
      {category === "translation" && <TranslationSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {category === "clipboard" && <ClipboardSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {category === "music" && <MusicSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {category === "shelf" && <ShelfSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {category === "agents" && <AgentSettingsPage settings={settings} onSettingsChange={setSettings} onOpenConnect={() => setCategory("agentConnect")} />}
      {category === "agentAlerts" && <AgentAlertsSettingsPage settings={settings} onSettingsChange={setSettings} />}
      {category === "sounds" && <SoundSettingsSection />}
      {category === "agentApprovals" && <AgentApprovalSettings />}
      {category === "agentConnect" && <AgentConnectSettingsPage />}
      {category === "about" && <AboutSettingsPage />}
    </LayoutEditor>
  );
}
