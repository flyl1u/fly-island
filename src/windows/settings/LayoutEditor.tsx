import { RefreshCcw } from "lucide-react";
import { useTranslation, type LocaleCode } from "../../i18n";
import { LocaleControl } from "../../i18n/LocaleControl";
import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import type { AgentHooksInstallResult, AgentProvider, AgentStatusSnapshot } from "../../features/agent-status/api";
import type { AgentHooksInstallState } from "../../features/agent-status/status";
import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { LayoutSettingsSection } from "../../features/appearance/LayoutSettingsSection";
import { PresetSettingsSection } from "../../features/appearance/PresetSettingsSection";
import { TodoSettingsSection } from "../../features/appearance/TodoSettingsSection";
import type { IslandPreset, IslandSettings } from "../../features/appearance/types";
import type { ClipboardHistorySettings } from "../../features/clipboard/api";
import { ClipboardSettingsSection } from "../../features/clipboard/ClipboardSettingsSection";
import { QQNotificationControls, type QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import { WeChatReminderControls, type WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { SavePathSettingsSection } from "../../features/todos/SavePathSettingsSection";
import type { SavePathState } from "../../features/todos/types";
import { ProjectSettingsSection } from "../../features/updater/ProjectSettingsSection";

export function LayoutEditor({
  locale,
  settings,
  qqNotifications,
  wechatReminders,
  clipboardSettings,
  saveDirectoryDraft,
  savePathState,
  highlightSavePath,
  focusClipboardShortcutToken,
  presets,
  launchAtStartup,
  agentStatus,
  clearingAgentProvider,
  agentHooksInstallState,
  agentHooksInstallResult,
  agentHooksInstallError,
  onLocaleChange,
  onSettingsChange,
  onClipboardSettingsChange,
  onReset,
  onSaveDirectoryDraftChange,
  onSaveDirectory,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
  onLaunchAtStartupChange,
  onClearAgentStatus,
  onInstallAgentHooks,
  onClipboardShortcutFocusHandled,
}: {
  locale: LocaleCode;
  settings: IslandSettings;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  clipboardSettings: ClipboardHistorySettings;
  saveDirectoryDraft: string;
  savePathState: SavePathState;
  highlightSavePath: boolean;
  focusClipboardShortcutToken: number;
  presets: IslandPreset[];
  launchAtStartup: boolean;
  agentStatus: AgentStatusSnapshot;
  clearingAgentProvider: AgentProvider | null;
  agentHooksInstallState: AgentHooksInstallState;
  agentHooksInstallResult: AgentHooksInstallResult | null;
  agentHooksInstallError: string;
  onLocaleChange: (locale: LocaleCode) => void;
  onSettingsChange: (settings: IslandSettings) => void;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  onReset: () => void;
  onSaveDirectoryDraftChange: (value: string) => void;
  onSaveDirectory: () => void;
  onSavePreset: () => void;
  onApplyPreset: (presetId: string) => void;
  onRenamePreset: (presetId: string, name: string) => void;
  onDeletePreset: (presetId: string) => void;
  onLaunchAtStartupChange: (enabled: boolean) => void;
  onClearAgentStatus: (provider: AgentProvider) => void;
  onInstallAgentHooks: () => void;
  onClipboardShortcutFocusHandled: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="editor-panel">
      <div className="editor-panel__header">
        <span>{t.settings.title}</span>
        <button
          className="reset-button"
          type="button"
          title={t.settings.reset}
          aria-label={t.settings.reset}
          onClick={onReset}
        >
          <RefreshCcw size={15} strokeWidth={2.2} />
        </button>
      </div>

      <section className="settings-section settings-section--language">
        <div className="settings-section__header">
          <span>{t.settings.language.title}</span>
        </div>
        <LocaleControl
          label={t.settings.language.label}
          value={locale}
          onChange={onLocaleChange}
        />
      </section>

      <LayoutSettingsSection
        settings={settings}
        launchAtStartup={launchAtStartup}
        onSettingsChange={onSettingsChange}
        onLaunchAtStartupChange={onLaunchAtStartupChange}
      />

      <section className="settings-section settings-section--messages">
        <div className="settings-section__header"><span>{t.settings.messageReception}</span></div>
        <QQNotificationControls controller={qqNotifications} />
        <WeChatReminderControls controller={wechatReminders} />
      </section>

      <TodoSettingsSection settings={settings} onSettingsChange={onSettingsChange} />

      <AgentHooksSettingsSection
        agentStatus={agentStatus}
        clearingAgentProvider={clearingAgentProvider}
        agentHooksInstallState={agentHooksInstallState}
        agentHooksInstallResult={agentHooksInstallResult}
        agentHooksInstallError={agentHooksInstallError}
        onClearAgentStatus={onClearAgentStatus}
        onInstallAgentHooks={onInstallAgentHooks}
      />

      <ClipboardSettingsSection
        clipboardSettings={clipboardSettings}
        focusClipboardShortcutToken={focusClipboardShortcutToken}
        onClipboardSettingsChange={onClipboardSettingsChange}
        onClipboardShortcutFocusHandled={onClipboardShortcutFocusHandled}
      />

      <ColorSettingsSection settings={settings} onSettingsChange={onSettingsChange} />

      <PresetSettingsSection
        presets={presets}
        onSavePreset={onSavePreset}
        onApplyPreset={onApplyPreset}
        onRenamePreset={onRenamePreset}
        onDeletePreset={onDeletePreset}
      />

      <SavePathSettingsSection
        saveDirectoryDraft={saveDirectoryDraft}
        savePathState={savePathState}
        highlightSavePath={highlightSavePath}
        onSaveDirectoryDraftChange={onSaveDirectoryDraftChange}
        onSaveDirectory={onSaveDirectory}
      />

      <ProjectSettingsSection />
    </div>
  );
}
