import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { useTranslation } from "../../i18n";
import { TOP_EDGE_SHOULDER_SIZE } from "./settingsLimits";
import type { IslandSettings } from "./types";

type Props = {
  settings: IslandSettings;
  onChange: (settings: IslandSettings) => void;
};

/** The screen-top silhouette; the strength is useful only while the option is on. */
export function TopEdgeShoulderRows({ settings, onChange }: Props) {
  const t = useTranslation();
  const text = t.settings.appearance;
  return <>
    <SettingsToggleRow title={text.topEdgeShoulders} checked={settings.topEdgeShoulders}
      onChange={(topEdgeShoulders) => onChange({ ...settings, topEdgeShoulders })} />
    {settings.topEdgeShoulders && <SettingsSliderRow indent title={text.topEdgeShoulderSize}
      value={settings.topEdgeShoulderSize} {...TOP_EDGE_SHOULDER_SIZE} step={1}
      defaultValue={TOP_EDGE_SHOULDER_SIZE.default} resetLabel={t.settings.layout.resetToDefault}
      format={(value) => `${value}px`}
      onChange={(topEdgeShoulderSize) => onChange({ ...settings, topEdgeShoulderSize })} />}
  </>;
}
