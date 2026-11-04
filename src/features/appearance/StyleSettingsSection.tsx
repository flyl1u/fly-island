import { useTranslation } from "../../i18n";
import { SliderControl } from "../../components/controls/SliderControl";
import { AppearanceModeControl } from "./AppearanceModeControl";
import type { IslandSettings } from "./types";

export function StyleSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--style">
      <div className="settings-section__header">
        <span>{t.settings.appearance.styleTitle}</span>
      </div>
      <AppearanceModeControl
        value={settings.appearanceMode}
        onChange={(appearanceMode) =>
          onSettingsChange({ ...settings, appearanceMode })
        }
      />
      <div className="appearance-mode-control">
        <span>{t.settings.appearance.font}</span>
        <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.appearance.fontLabel}>
          {([["system", t.settings.appearance.systemFont], ["pixel", t.settings.appearance.pixelFont]] as const).map(([fontFamily, label]) => (
            <button
              key={fontFamily}
              className={settings.fontFamily === fontFamily ? "appearance-mode-control--active" : ""}
              type="button"
              aria-pressed={settings.fontFamily === fontFamily}
              onClick={() => onSettingsChange({ ...settings, fontFamily })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {settings.appearanceMode === "liquidGlass" && (
        <SliderControl
          label={t.settings.appearance.glassStrength}
          value={settings.glassIntensity}
          min={25}
          max={100}
          step={1}
          suffix="%"
          onChange={(glassIntensity) =>
            onSettingsChange({ ...settings, glassIntensity })
          }
        />
      )}
      <SliderControl
        label={t.settings.layout.opacity}
        value={settings.opacity}
        min={50}
        max={100}
        step={1}
        suffix="%"
        onChange={(opacity) => onSettingsChange({ ...settings, opacity })}
      />
    </section>
  );
}
