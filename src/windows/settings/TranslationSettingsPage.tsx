import type { IslandSettings } from "../../features/appearance/types";
import { TranslationSettingsSection } from "../../features/translation/TranslationSettingsSection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { TranslationShortcutRows } from "../../features/translation/TranslationShortcutRows";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { findShortcutOwner } from "./shortcutConflicts";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useMusicShortcuts } from "../../features/media/useMusicShortcuts";
import { useSettingsShortcutOwners } from "./useSettingsShortcutOwners";

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
  const [musicShortcuts] = useMusicShortcuts();
  const owners = useSettingsShortcutOwners(settings, clipboardSettings, translationSettings, musicShortcuts);
  const takenBy = (shortcut: string) => findShortcutOwner(shortcut, owners, "translation");

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.translation}
        checked={settings.translationEnabled}
        onChange={(translationEnabled) => onSettingsChange({ ...settings, translationEnabled })}
      />
      {settings.translationEnabled && <TranslationSettingsSection />}
      {settings.translationEnabled && (
        <SettingsGroup title={t.settings.categories.shortcuts} footer={t.settings.shortcuts.globalHint}>
          <TranslationShortcutRows settings={translationSettings} onSettingsChange={setTranslationSettings} takenBy={takenBy} />
        </SettingsGroup>
      )}
    </>
  );
}
