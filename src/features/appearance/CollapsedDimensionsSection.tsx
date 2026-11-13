import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { COLLAPSED_HEIGHT, COLLAPSED_WIDTH } from "./settingsLimits";
import type { IslandSettings } from "./types";

export function CollapsedDimensionsSection({ settings, onChange }: {
  settings: IslandSettings;
  onChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearance.collapsedDimensions;
  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      <SettingsToggleRow
        title={text.autoWidth}
        checked={settings.collapsedAutoWidth}
        onChange={(collapsedAutoWidth) => onChange({ ...settings, collapsedAutoWidth })}
      />
      {!settings.collapsedAutoWidth && (
        <SettingsNumberRow title={text.width} unit={text.unit} value={settings.collapsedWidth}
          min={COLLAPSED_WIDTH.min} max={COLLAPSED_WIDTH.max}
          onChange={(collapsedWidth) => onChange({ ...settings, collapsedWidth })} />
      )}
      <SettingsNumberRow title={text.height} unit={text.unit} value={settings.collapsedHeight}
        min={COLLAPSED_HEIGHT.min} max={COLLAPSED_HEIGHT.max}
        onChange={(collapsedHeight) => onChange({ ...settings, collapsedHeight })} />
    </SettingsGroup>
  );
}
