import type { IslandSettings, TranslationTarget } from "../../features/appearance/types";
import { TranslationSettingsSection } from "../../features/translation/TranslationSettingsSection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { ShortcutsLinkSection } from "./ShortcutsSettingsPage";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";

export function TranslationSettingsPage({
  settings,
  onSettingsChange,
  onOpenShortcuts,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onOpenShortcuts: () => void;
}) {
  const t = useTranslation();
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
      {settings.translationEnabled && <ShortcutsLinkSection onOpen={onOpenShortcuts} />}
    </>
  );
}
