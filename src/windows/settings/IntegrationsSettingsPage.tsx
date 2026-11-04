import { AgentHooksSettingsSection } from "../../features/agent-status/AgentHooksSettingsSection";
import { useAgentStatusSettings } from "../../features/agent-status/useAgentStatusSettings";
import { ClipboardSettingsSection } from "../../features/clipboard/ClipboardSettingsSection";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";

function noop() {}

export function IntegrationsSettingsPage() {
  // Owned by the page so agent status is only polled while it is open.
  const agentStatus = useAgentStatusSettings();
  const [clipboardSettings, updateClipboardSettings] = useClipboardSettings();

  return (
    <>
      <AgentHooksSettingsSection {...agentStatus} />
      <ClipboardSettingsSection
        clipboardSettings={clipboardSettings}
        focusClipboardShortcutToken={0}
        onClipboardSettingsChange={updateClipboardSettings}
        onClipboardShortcutFocusHandled={noop}
      />
    </>
  );
}
