import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { COLLAPSED_CORNER_RADIUS, ISLAND_CORNER_RADIUS } from "./settingsLimits";
import type { IslandCornerShape, IslandSettings } from "./types";

type Props = {
  settings: IslandSettings;
  onChange: (settings: IslandSettings) => void;
};

/**
 * The open and collapsed island's corner radii (set apart since 2026-11-18) and their shared
 * shape. Tucked and detached corners follow the collapsed radius, the inner panels the open one.
 */
export function IslandCornerRows({ settings, onChange }: Props) {
  const t = useTranslation();
  const text = t.settings.appearance;
  const shapes = (["squircle", "round"] as const).map((value) => ({ value, label: text.cornerShapes[value] }));
  return <>
    <SettingsSliderRow title={text.cornerRadius} description={text.cornerRadiusHint}
      value={settings.islandCornerRadius} min={ISLAND_CORNER_RADIUS.min} max={ISLAND_CORNER_RADIUS.max} step={1}
      defaultValue={ISLAND_CORNER_RADIUS.default} resetLabel={t.settings.layout.resetToDefault}
      format={(value) => `${value}px`}
      onChange={(islandCornerRadius) => onChange({ ...settings, islandCornerRadius })} />
    <SettingsSliderRow title={text.collapsedCornerRadius}
      value={settings.collapsedCornerRadius} min={COLLAPSED_CORNER_RADIUS.min} max={COLLAPSED_CORNER_RADIUS.max} step={0.5}
      defaultValue={COLLAPSED_CORNER_RADIUS.default} resetLabel={t.settings.layout.resetToDefault}
      format={(value) => `${Math.round(value * 10) / 10}px`}
      onChange={(collapsedCornerRadius) => onChange({ ...settings, collapsedCornerRadius })} />
    <SettingsRow
      title={text.cornerShape}
      control={
        <SettingsChoice<IslandCornerShape>
          value={settings.islandCornerShape}
          options={shapes}
          ariaLabel={text.cornerShape}
          onChange={(islandCornerShape) => onChange({ ...settings, islandCornerShape })}
        />
      }
    />
  </>;
}
