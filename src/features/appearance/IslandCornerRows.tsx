import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { CAPSULE_SHAPE_ENABLED } from "./islandShape";
import { COLLAPSED_CORNER_RADIUS, ISLAND_CORNER_RADIUS } from "./settingsLimits";
import type { IslandCornerShape, IslandSettings, IslandShape } from "./types";

type Props = {
  settings: IslandSettings;
  onChange: (settings: IslandSettings) => void;
};

/** Appearance → Open: the open island's corners, which the panels inside it follow. */
export function ExpandedCornerRow({ settings, onChange }: Props) {
  const t = useTranslation();
  const text = t.settings.appearance;
  return <SettingsSliderRow title={text.cornerRadius} description={text.cornerRadiusHint}
    value={settings.islandCornerRadius} min={ISLAND_CORNER_RADIUS.min} max={ISLAND_CORNER_RADIUS.max} step={1}
    defaultValue={ISLAND_CORNER_RADIUS.default} resetLabel={t.settings.layout.resetToDefault}
    format={(value) => `${value}px`}
    onChange={(islandCornerRadius) => onChange({ ...settings, islandCornerRadius })} />;
}

/**
 * Appearance → Collapsed: the collapsed bar's corners (set apart from the open ones since
 * 2026-11-18), which tucked and detached corners follow too. The capsule's collapsed radius is
 * always half its height, so the row hides for it.
 */
export function CollapsedCornerRow({ settings, onChange }: Props) {
  const t = useTranslation();
  if (settings.islandShape === "capsule") return null;
  return <SettingsSliderRow title={t.settings.appearance.collapsedCornerRadius}
    value={settings.collapsedCornerRadius} min={COLLAPSED_CORNER_RADIUS.min} max={COLLAPSED_CORNER_RADIUS.max} step={0.5}
    defaultValue={COLLAPSED_CORNER_RADIUS.default} resetLabel={t.settings.layout.resetToDefault}
    format={(value) => `${Math.round(value * 10) / 10}px`}
    onChange={(collapsedCornerRadius) => onChange({ ...settings, collapsedCornerRadius })} />;
}

/** Appearance → Theme: the island's shape (notch or capsule, once offered) and the corner shape both states share. */
export function IslandShapeRows({ settings, onChange }: Props) {
  const t = useTranslation();
  const text = t.settings.appearance;
  const shapes = (["squircle", "round"] as const).map((value) => ({ value, label: text.cornerShapes[value] }));
  const islandShapes = (["notch", "capsule"] as const).map((value) => ({ value, label: text.islandShapes[value] }));
  return <>
    {CAPSULE_SHAPE_ENABLED && <SettingsRow
      title={text.islandShape}
      description={text.islandShapeHint}
      control={
        <SettingsChoice<IslandShape>
          value={settings.islandShape}
          options={islandShapes}
          ariaLabel={text.islandShape}
          onChange={(islandShape) => onChange({ ...settings, islandShape })}
        />
      }
    />}
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
