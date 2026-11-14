import { ClipboardSettingsSection } from "../../features/clipboard/ClipboardSettingsSection";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { ClipboardShortcutRows } from "../../features/clipboard/ClipboardShortcutRows";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { findShortcutOwner } from "./shortcutConflicts";
import { ShelfSettingsGroup } from "./ShelfSettingsGroup";

/** Settings → Clipboard & files: clipboard history (switch, images, length, shortcut), then the file shelf. */
export function ClipboardSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const [clipboardSettings, updateClipboardSettings] = useClipboardSettings();
  const [translationSettings] = useTranslationSettings();
  // A global hotkey swallows its keys everywhere, so it may not reuse translation's.
  const takenBy = (shortcut: string) => findShortcutOwner(
    shortcut,
    settings.translationEnabled
      ? [{ id: "translation", label: t.settings.shortcuts.openTranslation, shortcut: translationSettings.shortcut }]
      : [],
    "clipboard",
  );

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.clipboard}
        checked={clipboardSettings.enabled}
        onChange={(enabled) => updateClipboardSettings({ ...clipboardSettings, enabled })}
      />
      {clipboardSettings.enabled && (
        <ClipboardSettingsSection
          clipboardSettings={clipboardSettings}
          onClipboardSettingsChange={updateClipboardSettings}
          visibleRows={settings.clipboardVisibleRows}
          onVisibleRowsChange={(clipboardVisibleRows) => onSettingsChange({ ...settings, clipboardVisibleRows })}
        />
      )}
      {clipboardSettings.enabled && (
        <SettingsGroup title={t.settings.categories.shortcuts} footer={t.settings.shortcuts.globalHint}>
          <ClipboardShortcutRows
            clipboardSettings={clipboardSettings}
            onClipboardSettingsChange={updateClipboardSettings}
            takenBy={takenBy}
          />
        </SettingsGroup>
      )}
      <ShelfSettingsGroup settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
