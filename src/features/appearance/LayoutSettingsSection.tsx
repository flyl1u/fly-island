import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { DEFAULT_SETTINGS, MAX_ISLAND_CORNER_RADIUS, MAX_MAX_PANEL_HEIGHT, MIN_ISLAND_CORNER_RADIUS, MIN_MAX_PANEL_HEIGHT } from "./settings";
import type { IslandCornerShape, IslandSettings } from "./types";

const scale = (value: number) => `${value.toFixed(2)}x`;
const pixels = (value: number) => `${Math.round(value)} px`;

/** Appearance → Size, then Corners: the island's scale and panel height, and its corner shape and radii. */
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
  const text = t.settings.layout;
  const change = (next: IslandSettings, previewExpanded?: boolean) => {
    onSettingsChange(next);
    if (previewExpanded !== undefined) {
      onPreviewIsland?.(previewExpanded);
    }
  };
  const shapes = [
    { value: "squircle", label: text.cornerShapeSquircle },
    { value: "round", label: text.cornerShapeRound },
  ] as const;

  return (
    <>
      <SettingsGroup title={text.sizeTitle}>
        <SettingsSliderRow
          title={text.collapsedScale}
          value={settings.collapsedScale}
          min={0.75}
          max={1.4}
          step={0.01}
          format={scale}
          defaultValue={DEFAULT_SETTINGS.collapsedScale}
          resetLabel={text.resetToDefault}
          onChange={(collapsedScale) => change({ ...settings, collapsedScale }, false)}
        />
        <SettingsSliderRow
          title={text.expandedScale}
          value={settings.expandedScale}
          min={0.75}
          max={1.4}
          step={0.01}
          format={scale}
          defaultValue={DEFAULT_SETTINGS.expandedScale}
          resetLabel={text.resetToDefault}
          onChange={(expandedScale) => change({ ...settings, expandedScale }, true)}
        />
        <SettingsSliderRow
          title={text.maxPanelHeight}
          value={settings.maxPanelHeight}
          min={MIN_MAX_PANEL_HEIGHT}
          max={MAX_MAX_PANEL_HEIGHT}
          step={1}
          format={pixels}
          defaultValue={DEFAULT_SETTINGS.maxPanelHeight}
          resetLabel={text.resetToDefault}
          onChange={(maxPanelHeight) => change({ ...settings, maxPanelHeight }, true)}
        />
      </SettingsGroup>
      <SettingsGroup title={text.cornersTitle}>
        <SettingsRow
          title={text.islandCornerShape}
          control={
            <SettingsChoice<IslandCornerShape>
              value={settings.islandCornerShape}
              options={shapes}
              ariaLabel={text.islandCornerShape}
              onChange={(islandCornerShape) => change({ ...settings, islandCornerShape }, true)}
            />
          }
        />
        <SettingsSliderRow
          title={text.islandCornerRadius}
          value={settings.islandCornerRadius}
          min={MIN_ISLAND_CORNER_RADIUS}
          max={MAX_ISLAND_CORNER_RADIUS}
          step={1}
          format={pixels}
          defaultValue={DEFAULT_SETTINGS.islandCornerRadius}
          resetLabel={text.resetToDefault}
          onChange={(islandCornerRadius) => change({ ...settings, islandCornerRadius }, true)}
        />
      </SettingsGroup>
    </>
  );
}
