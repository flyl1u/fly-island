import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { DEFAULT_SETTINGS, EXPANDED_SCALES, LIQUID_GLASS_ENABLED, nearestExpandedSize, type ExpandedSize } from "./settings";
import type { AppearanceMode, IslandFont, IslandSettings } from "./types";

const percent = (value: number) => `${Math.round(value)}%`;

/** Appearance → Style: classic or liquid glass, the font, how see-through, and how big the island is collapsed and opened. */
export function StyleSettingsSection({
  settings,
  onSettingsChange,
  onPreviewIsland,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  /** Called while a size changes, so the island shows that size (collapsed or opened). */
  onPreviewIsland?: (mode: "collapsed" | "expanded") => void;
}) {
  const t = useTranslation();
  const text = t.settings.appearance;
  const modes = [
    { value: "classic", label: text.classic },
    { value: "liquidGlass", label: text.liquidGlass },
  ] as const;
  const fonts = [
    { value: "system", label: text.systemFont },
    { value: "pixel", label: text.pixelFont },
  ] as const;
  const sizes = (Object.keys(EXPANDED_SCALES) as ExpandedSize[]).map((size) => ({ value: size, label: t.settings.layout.expandedSizes[size] }));

  return (
    <SettingsGroup title={text.styleTitle}>
      {LIQUID_GLASS_ENABLED && <SettingsRow
        title={text.title}
        control={
          <SettingsChoice<AppearanceMode>
            value={settings.appearanceMode}
            options={modes}
            ariaLabel={text.title}
            onChange={(appearanceMode) => onSettingsChange({ ...settings, appearanceMode })}
          />
        }
      />}
      {LIQUID_GLASS_ENABLED && settings.appearanceMode === "liquidGlass" && (
        <SettingsSliderRow
          title={text.glassStrength}
          value={settings.glassIntensity}
          min={25}
          max={100}
          step={1}
          format={percent}
          defaultValue={DEFAULT_SETTINGS.glassIntensity}
          resetLabel={t.settings.layout.resetToDefault}
          indent
          onChange={(glassIntensity) => onSettingsChange({ ...settings, glassIntensity })}
        />
      )}
      <SettingsRow
        title={text.font}
        control={
          <SettingsChoice<IslandFont>
            value={settings.fontFamily}
            options={fonts}
            ariaLabel={text.fontLabel}
            onChange={(fontFamily) => onSettingsChange({ ...settings, fontFamily })}
          />
        }
      />
      <SettingsSliderRow
        title={t.settings.layout.opacity}
        value={settings.opacity}
        min={50}
        max={100}
        step={1}
        format={percent}
        defaultValue={DEFAULT_SETTINGS.opacity}
        resetLabel={t.settings.layout.resetToDefault}
        onChange={(opacity) => onSettingsChange({ ...settings, opacity })}
      />
      <SettingsSliderRow
        title={t.settings.layout.collapsedScale}
        value={settings.collapsedScale}
        min={0.75}
        max={1.4}
        step={0.01}
        format={(value) => `${value.toFixed(2)}x`}
        defaultValue={DEFAULT_SETTINGS.collapsedScale}
        resetLabel={t.settings.layout.resetToDefault}
        onChange={(collapsedScale) => {
          onSettingsChange({ ...settings, collapsedScale });
          onPreviewIsland?.("collapsed");
        }}
      />
      <SettingsRow
        title={t.settings.layout.expandedScale}
        control={
          <SettingsChoice<ExpandedSize>
            value={nearestExpandedSize(settings.expandedScale)}
            options={sizes}
            ariaLabel={t.settings.layout.expandedScale}
            onChange={(size) => {
              onSettingsChange({ ...settings, expandedScale: EXPANDED_SCALES[size] });
              onPreviewIsland?.("expanded");
            }}
          />
        }
      />
    </SettingsGroup>
  );
}
