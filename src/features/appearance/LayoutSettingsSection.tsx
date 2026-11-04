import { useTranslation } from "../../i18n";
import { SliderControl } from "../../components/controls/SliderControl";
import { MAX_ISLAND_CORNER_RADIUS, MAX_MAX_PANEL_HEIGHT, MAX_TOP_FILLET_RADIUS, MIN_ISLAND_CORNER_RADIUS, MIN_MAX_PANEL_HEIGHT, MIN_TOP_FILLET_RADIUS } from "./settings";
import type { IslandSettings } from "./types";

export function LayoutSettingsSection({
  settings,
  onSettingsChange,
  onPreviewIsland,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  /** Called while a slider moves with the island state it changes: expanded or not. */
  onPreviewIsland?: (expanded: boolean) => void;
}) {
  const t = useTranslation();
  const change = (next: IslandSettings, previewExpanded?: boolean) => {
    onSettingsChange(next);
    if (previewExpanded !== undefined) {
      onPreviewIsland?.(previewExpanded);
    }
  };

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
        onChange={(collapsedScale) => change({ ...settings, collapsedScale }, false)}
      />
      <SliderControl
        label={t.settings.layout.expandedScale}
        value={settings.expandedScale}
        min={0.75}
        max={1.4}
        step={0.01}
        suffix="x"
        onChange={(expandedScale) => change({ ...settings, expandedScale }, true)}
      />
      <SliderControl
        label={t.settings.layout.maxPanelHeight}
        value={settings.maxPanelHeight}
        min={MIN_MAX_PANEL_HEIGHT}
        max={MAX_MAX_PANEL_HEIGHT}
        step={1}
        suffix="px"
        onChange={(maxPanelHeight) => change({ ...settings, maxPanelHeight }, true)}
      />
      <SliderControl
        label={t.settings.layout.islandCornerRadius}
        value={settings.islandCornerRadius}
        min={MIN_ISLAND_CORNER_RADIUS}
        max={MAX_ISLAND_CORNER_RADIUS}
        step={1}
        suffix="px"
        onChange={(islandCornerRadius) => change({ ...settings, islandCornerRadius }, true)}
      />
      <SliderControl
        label={t.settings.layout.topFilletRadius}
        value={settings.topFilletRadius}
        min={MIN_TOP_FILLET_RADIUS}
        max={MAX_TOP_FILLET_RADIUS}
        step={1}
        suffix="px"
        onChange={(topFilletRadius) => change({ ...settings, topFilletRadius })}
      />
    </section>
  );
}
