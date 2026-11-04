import { useTranslation } from "../../i18n";
import { SliderControl } from "../../components/controls/SliderControl";
import { MAX_ISLAND_CORNER_RADIUS, MAX_TOP_FILLET_RADIUS, MIN_ISLAND_CORNER_RADIUS, MIN_TOP_FILLET_RADIUS } from "./settings";
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
      <SliderControl
        label={t.settings.layout.islandCornerRadius}
        value={settings.islandCornerRadius}
        min={MIN_ISLAND_CORNER_RADIUS}
        max={MAX_ISLAND_CORNER_RADIUS}
        step={1}
        suffix="px"
        onChange={(islandCornerRadius) => onSettingsChange({ ...settings, islandCornerRadius })}
      />
      <SliderControl
        label={t.settings.layout.topFilletRadius}
        value={settings.topFilletRadius}
        min={MIN_TOP_FILLET_RADIUS}
        max={MAX_TOP_FILLET_RADIUS}
        step={1}
        suffix="px"
        onChange={(topFilletRadius) => onSettingsChange({ ...settings, topFilletRadius })}
      />
    </section>
  );
}
