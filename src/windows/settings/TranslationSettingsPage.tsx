import type { IslandSettings, TranslationTarget } from "../../features/appearance/types";
import { TranslationSettingsSection } from "../../features/translation/TranslationSettingsSection";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";
import { ShortcutsLinkSection } from "./ShortcutsSettingsPage";
import "../../features/appearance/AppearanceModeControl.css";

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
  const targets: [TranslationTarget, string][] = [
    ["window", t.settings.translation.targetWindow],
    ["island", t.settings.translation.targetIsland],
  ];

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.translation}
        checked={settings.translationEnabled}
        onChange={(translationEnabled) => onSettingsChange({ ...settings, translationEnabled })}
      />
      {settings.translationEnabled && (
        <section className="settings-section settings-section--translation-target">
          <div className="settings-section__header"><span>{t.settings.translation.targetTitle}</span></div>
          <div className="appearance-mode-control">
            <span>{t.settings.translation.target}</span>
            <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.translation.target}>
              {targets.map(([translationTarget, label]) => (
                <button
                  key={translationTarget}
                  className={settings.translationTarget === translationTarget ? "appearance-mode-control--active" : ""}
                  type="button"
                  aria-pressed={settings.translationTarget === translationTarget}
                  onClick={() => onSettingsChange({ ...settings, translationTarget })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="settings-section__hint">{t.settings.translation.targetHint}</p>
        </section>
      )}
      {settings.translationEnabled && <TranslationSettingsSection />}
      {settings.translationEnabled && <ShortcutsLinkSection onOpen={onOpenShortcuts} />}
    </>
  );
}
