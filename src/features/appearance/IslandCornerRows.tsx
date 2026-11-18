import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { ISLAND_CORNER_RADIUS } from "./settingsLimits";
import type { IslandCornerShape, IslandSettings } from "./types";

type Props = {
  settings: IslandSettings;
  onChange: (settings: IslandSettings) => void;
};

/**
 * The open island's corner radius and shape. Every other island radius (collapsed, tucked,
 * the panels inside) scales from it (IslandShell.css), so the island keeps one corner style.
 */
export function IslandCornerRows({ settings, onChange }: Props) {
  const t = useTranslation();
  const text = t.settings.appearance;
  const shapes = (["squircle", "round"] as const).map((value) => ({ value, label: text.cornerShapes[value] }));
  return <>
    <SettingsSliderRow title={text.cornerRadius} description={text.cornerRadiusHint}
      value={settings.islandCornerRadius} min={ISLAND_CORNER_RADIUS.min} max={ISLAND_CORNER_RADIUS.max} step={1}
      defaultValue={ISLAND_CORNER_RADIUS.default} resetLabel={t.settings.layout.resetToDefault}
      format={(value) => `${value}px`} commitOnRelease
      onChange={(islandCornerRadius) => onChange({ ...settings, islandCornerRadius })} />
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
