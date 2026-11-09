import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { ClipboardHistorySettings } from "./api";

/**
 * The clipboard history options below the module switch (which is `enabled`, set by the
 * page). Its shortcut is the next group on the page.
 */
export function ClipboardSettingsSection({ clipboardSettings, onClipboardSettingsChange }: {
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
}) {
  const t = useTranslation();

  return (
    <SettingsGroup title={t.settings.clipboard.title}>
      <SettingsToggleRow
        title={t.settings.clipboard.captureImages}
        checked={clipboardSettings.captureImages}
        onChange={(captureImages) => onClipboardSettingsChange({ ...clipboardSettings, captureImages })}
      />
      <SettingsNumberRow
        title={t.settings.clipboard.maxItems}
        value={clipboardSettings.maxItems}
        min={5}
        max={200}
        onChange={(maxItems) => onClipboardSettingsChange({ ...clipboardSettings, maxItems })}
      />
    </SettingsGroup>
  );
}
