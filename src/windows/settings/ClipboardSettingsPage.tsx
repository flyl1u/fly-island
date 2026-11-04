import { ClipboardSettingsSection } from "../../features/clipboard/ClipboardSettingsSection";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";

function noop() {}

export function ClipboardSettingsPage() {
  const [clipboardSettings, updateClipboardSettings] = useClipboardSettings();

  return (
    <ClipboardSettingsSection
      clipboardSettings={clipboardSettings}
      focusClipboardShortcutToken={0}
      onClipboardSettingsChange={updateClipboardSettings}
      onClipboardShortcutFocusHandled={noop}
    />
  );
}
