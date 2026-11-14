import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { DEFAULT_SETTINGS, ISLAND_FONT_PERCENT, isGlass, MAX_COLLAPSED_SCALE, MAX_EXPANDED_SCALE, MIN_COLLAPSED_SCALE, MIN_EXPANDED_SCALE } from "./settings";
import type { ColorScheme, IslandFont, IslandSettings, Material, PageButtonStyle } from "./types";

const percent = (value: number) => `${Math.round(value)}%`;
const times = (value: number) => `${value.toFixed(2)}x`;

/** Appearance → Style: the colour scheme and material, the font, how see-through, and how big the island is collapsed and opened. */
export function StyleSettingsSection({
  settings,
  onSettingsChange,
  onPreviewIsland,
  onExpandedScalePreview,
  onFontSizePreview,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  /** Called while a size changes, so the island shows that size (collapsed or opened). */
  onPreviewIsland?: (mode: "collapsed" | "expanded") => void;
  onExpandedScalePreview?: (value: number | null) => void;
  onFontSizePreview?: (value: number | null) => void;
}) {
  const t = useTranslation();
  const text = t.settings.appearance;
  const materials = [
    { value: "classic", label: text.classic },
    { value: "liquidGlass", label: text.liquidGlass },
    { value: "frostedGlass", label: text.frostedGlass },
  ] as const;
  const schemes = [
    { value: "dark", label: text.schemeDark },
    { value: "light", label: text.schemeLight },
    { value: "system", label: text.schemeSystem },
  ] as const;
  const fonts = [
    { value: "system", label: text.systemFont },
    { value: "pixel", label: text.pixelFont },
  ] as const;

  return (
    <SettingsGroup title={text.styleTitle}>
      <SettingsRow
        title={text.colorScheme}
        control={
          <SettingsChoice<ColorScheme>
            value={settings.colorScheme}
            options={schemes}
            ariaLabel={text.colorScheme}
            onChange={(colorScheme) => onSettingsChange({ ...settings, colorScheme })}
          />
        }
      />
      <SettingsRow
        title={text.material}
        control={
          <SettingsChoice<Material>
            value={settings.material}
            options={materials}
            ariaLabel={text.material}
            onChange={(material) => onSettingsChange({ ...settings, material })}
          />
        }
      />
      {isGlass(settings.material) && (
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
        title={text.fontSize}
        value={settings.islandFontPercent}
        min={ISLAND_FONT_PERCENT.min}
        max={ISLAND_FONT_PERCENT.max}
        step={ISLAND_FONT_PERCENT.step}
        format={percent}
        defaultValue={ISLAND_FONT_PERCENT.default}
        resetLabel={t.settings.layout.resetToDefault}
        commitOnRelease
        onPreviewChange={onFontSizePreview}
        onChange={(islandFontPercent) => onSettingsChange({ ...settings, islandFontPercent })}
      />
      <SettingsRow
        title={text.pageButtons}
        control={
          <SettingsChoice<PageButtonStyle>
            value={settings.pageButtonStyle}
            options={[
              { value: "capsule", label: text.capsules },
              { value: "icon", label: text.icons },
            ]}
            ariaLabel={text.pageButtons}
            onChange={(pageButtonStyle) => onSettingsChange({ ...settings, pageButtonStyle })}
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
        min={MIN_COLLAPSED_SCALE}
        max={MAX_COLLAPSED_SCALE}
        step={0.01}
        format={times}
        defaultValue={DEFAULT_SETTINGS.collapsedScale}
        resetLabel={t.settings.layout.resetToDefault}
        onChange={(collapsedScale) => {
          onSettingsChange({ ...settings, collapsedScale });
          onPreviewIsland?.("collapsed");
        }}
      />
      {/* Applied when the thumb is let go: the island (which may hold this very slider) resizes
          once, with its spring, rather than on every step of the drag. */}
      <SettingsSliderRow
        title={t.settings.layout.expandedScale}
        value={settings.expandedScale}
        min={MIN_EXPANDED_SCALE}
        max={MAX_EXPANDED_SCALE}
        step={0.01}
        format={times}
        defaultValue={DEFAULT_SETTINGS.expandedScale}
        resetLabel={t.settings.layout.resetToDefault}
        commitOnRelease
        onPreviewChange={onExpandedScalePreview}
        onChange={(expandedScale) => {
          onSettingsChange({ ...settings, expandedScale });
          onPreviewIsland?.("expanded");
        }}
      />
    </SettingsGroup>
  );
}
