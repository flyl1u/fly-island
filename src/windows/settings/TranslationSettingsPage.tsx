import type { IslandSettings, TranslationTarget } from "../../features/appearance/types";
import { TranslationSettingsSection } from "../../features/translation/TranslationSettingsSection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { TranslationShortcutRows } from "../../features/translation/TranslationShortcutRows";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { findShortcutOwner } from "./shortcutConflicts";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";

export function TranslationSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const [translationSettings, setTranslationSettings] = useTranslationSettings();
  const [clipboardSettings] = useClipboardSettings();
  // A global hotkey swallows its keys everywhere, so it may not reuse the clipboard's.
  const takenBy = (shortcut: string) => findShortcutOwner(
    shortcut,
    clipboardSettings.enabled && clipboardSettings.shortcutEnabled
      ? [{ id: "clipboard", label: t.settings.clipboard.shortcut, shortcut: clipboardSettings.shortcut }]
      : [],
    "translation",
  );
  const targets = [
    { value: "window", label: t.settings.translation.targetWindow },
    { value: "island", label: t.settings.translation.targetIsland },
  ] as const;

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.translation}
        checked={settings.translationEnabled}
        onChange={(translationEnabled) => onSettingsChange({ ...settings, translationEnabled })}
      />
      {settings.translationEnabled && (
        <SettingsGroup title={t.settings.translation.targetTitle} footer={t.settings.translation.targetHint}>
          <SettingsRow
            title={t.settings.translation.target}
            control={
              <SettingsChoice<TranslationTarget>
                value={settings.translationTarget}
                options={targets}
                ariaLabel={t.settings.translation.target}
                onChange={(translationTarget) => onSettingsChange({ ...settings, translationTarget })}
              />
            }
          />
        </SettingsGroup>
      )}
      {settings.translationEnabled && <TranslationSettingsSection />}
      {settings.translationEnabled && (
        <SettingsGroup title={t.settings.categories.shortcuts} footer={t.settings.shortcuts.globalHint}>
          <TranslationShortcutRows settings={translationSettings} onSettingsChange={setTranslationSettings} takenBy={takenBy} />
        </SettingsGroup>
      )}
    </>
  );
}
