import { useTranslation } from "../../i18n";
import { SliderControl } from "../../components/controls/SliderControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { AppearanceModeControl } from "./AppearanceModeControl";
import { LIQUID_GLASS_ENABLED } from "./settings";
import type { IslandSettings } from "./types";

export function LayoutSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--layout">
      <div className="settings-section__header">
        <span>{t.settings.layout.title}</span>
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
      {LIQUID_GLASS_ENABLED && settings.appearanceMode === "liquidGlass" && (
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
      <SliderControl
        label={t.settings.layout.collapsedScale}
        value={settings.collapsedScale}
        min={0.75}
        max={1.4}
        step={0.01}
        suffix="x"
        onChange={(collapsedScale) => onSettingsChange({ ...settings, collapsedScale })}
      />
      <SliderControl
        label={t.settings.layout.expandedScale}
        value={settings.expandedScale}
        min={0.75}
        max={1.4}
        step={0.01}
        suffix="x"
        onChange={(expandedScale) => onSettingsChange({ ...settings, expandedScale })}
      />
      <SliderControl
        label={t.settings.layout.marginY}
        value={settings.marginY}
        min={0}
        max={160}
        step={1}
        suffix="px"
        onChange={(marginY) => onSettingsChange({ ...settings, marginY })}
      />
      <ToggleControl
        label={t.settings.layout.showCollapsedText}
        checked={settings.showCollapsedText}
        onChange={(showCollapsedText) =>
          onSettingsChange({ ...settings, showCollapsedText })
        }
      />
      <ToggleControl
        label={t.settings.layout.showIdleTodoCount}
        checked={settings.showIdleTodoCount}
        onChange={(showIdleTodoCount) =>
          onSettingsChange({ ...settings, showIdleTodoCount })
        }
      />
      <ToggleControl
        label={t.settings.layout.showTitle}
        checked={settings.showTitle}
        onChange={(showTitle) => onSettingsChange({ ...settings, showTitle })}
      />
    </section>
  );
}
