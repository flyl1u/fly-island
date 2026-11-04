import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import type { useAgentStatusSettings } from "../../features/agent-status/useAgentStatusSettings";
import type { ClipboardHistorySettings } from "../../features/clipboard/api";
import { ClipboardSettingsSection } from "../../features/clipboard/ClipboardSettingsSection";

function noop() {}

export function IntegrationsSettingsPage({
  agentStatus,
  clipboardSettings,
  onClipboardSettingsChange,
}: {
  agentStatus: ReturnType<typeof useAgentStatusSettings>;
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
}) {
  return (
    <>
      <AgentHooksSettingsSection {...agentStatus} />
      <ClipboardSettingsSection
        clipboardSettings={clipboardSettings}
        focusClipboardShortcutToken={0}
        onClipboardSettingsChange={onClipboardSettingsChange}
        onClipboardShortcutFocusHandled={noop}
      />
    </>
  );
}
