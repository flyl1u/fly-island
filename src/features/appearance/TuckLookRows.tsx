import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useEdgePetSettings } from "../edge-pet/storage";
import { useTranslation } from "../../i18n";
import { TUCK_EDGE_HEIGHT } from "./settingsLimits";
import type { IslandSettings, TuckStyle } from "./types";

/**
 * Appearance → Tuck to the edge: how the tucked island looks (its rim, a short line, or nothing)
 * and how much of it the rim leaves showing. On the appearance page since 2026-11-19: it changes
 * how the island looks, not when it tucks. Clicking "tuck to the top" tucks it too, so it is
 * offered with auto-tuck off. Each change shows the island tucked.
 */
export function TuckLookRows({ settings, onSettingsChange, onPreviewTuck }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onPreviewTuck: () => void;
}) {
  const t = useTranslation();
  const expand = t.settings.expand;
  const [petSettings, setPetSettings] = useEdgePetSettings();
  const update = (patch: Partial<IslandSettings>) => {
    onSettingsChange({ ...settings, ...patch });
    onPreviewTuck();
  };
  const tuckStyles: { value: TuckStyle; label: string }[] = (["edge", "line", "hidden"] as const).map((value) => ({
    value,
    label: expand.tuckStyles[value],
  }));
  return (
    <>
      <SettingsRow
        title={expand.tuckStyle}
        control={
          <SettingsChoice
            value={settings.tuckStyle}
            options={tuckStyles}
            ariaLabel={expand.tuckStyle}
            onChange={(tuckStyle) => update({ tuckStyle })}
          />
        }
      />
      {settings.tuckStyle === "edge" && (
        <SettingsSliderRow indent title={expand.tuckEdgeHeight} value={settings.tuckEdgeHeight}
          min={TUCK_EDGE_HEIGHT.min} max={TUCK_EDGE_HEIGHT.max} step={1}
          defaultValue={TUCK_EDGE_HEIGHT.default} resetLabel={t.settings.layout.resetToDefault}
          format={(value) => `${value}px`} commitOnRelease
          onChange={(tuckEdgeHeight) => update({ tuckEdgeHeight })} />
      )}
      <SettingsToggleRow
        title={t.edgePet.toggleTitle}
        description={t.edgePet.toggleHint}
        checked={petSettings.enabled}
        onChange={(enabled) => {
          setPetSettings({ enabled });
          if (enabled) onPreviewTuck();
        }}
      />
    </>
  );
}
