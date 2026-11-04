import { useTranslation } from "../../i18n";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { IslandSettings } from "./types";
import "./GameModeSettingsSection.css";

/** Game mode: what the island holds back while a full-screen app is in front. */
export function GameModeSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--game-mode">
      <div className="settings-section__header">
        <span>{t.settings.gameMode.title}</span>
      </div>
      <p className="game-mode-hint">{t.settings.gameMode.hint}</p>
      <ToggleControl
        label={t.settings.gameMode.doNotDisturb}
        checked={settings.gameDoNotDisturb}
        onChange={(gameDoNotDisturb) => onSettingsChange({ ...settings, gameDoNotDisturb })}
      />
      <p className="game-mode-hint">{t.settings.gameMode.doNotDisturbHint}</p>
      <ToggleControl
        label={t.settings.gameMode.autoTuck}
        checked={settings.gameAutoTuck}
        onChange={(gameAutoTuck) => onSettingsChange({ ...settings, gameAutoTuck })}
      />
      <p className="game-mode-hint">{t.settings.gameMode.autoTuckHint}</p>
    </section>
  );
}
