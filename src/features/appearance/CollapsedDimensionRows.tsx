import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { COLLAPSED_HEIGHT, COLLAPSED_PADDING, COLLAPSED_WIDTH } from "./settingsLimits";
import type { IslandSettings } from "./types";

type Props = {
  settings: IslandSettings;
  onChange: (settings: IslandSettings) => void;
};

/** The collapsed island's width (automatic, or a set width), height and the space at its sides. */
export function CollapsedDimensionRows({ settings, onChange }: Props) {
  const text = useTranslation().settings.appearance.collapsedDimensions;
  return (
    <>
      <SettingsToggleRow
        title={text.autoWidth}
        checked={settings.collapsedAutoWidth}
        onChange={(collapsedAutoWidth) => onChange({ ...settings, collapsedAutoWidth })}
      />
      {settings.collapsedAutoWidth && (
        <>
          <SettingsNumberRow indent title={text.autoMin} unit={text.unit} value={settings.collapsedAutoWidthMin}
            min={COLLAPSED_WIDTH.min} max={COLLAPSED_WIDTH.max}
            onChange={(collapsedAutoWidthMin) => onChange({ ...settings, collapsedAutoWidthMin,
              collapsedAutoWidthMax: Math.max(settings.collapsedAutoWidthMax, collapsedAutoWidthMin) })} />
          <SettingsNumberRow indent title={text.autoMax} unit={text.unit} value={settings.collapsedAutoWidthMax}
            min={COLLAPSED_WIDTH.min} max={COLLAPSED_WIDTH.max}
            onChange={(collapsedAutoWidthMax) => onChange({ ...settings, collapsedAutoWidthMax,
              collapsedAutoWidthMin: Math.min(settings.collapsedAutoWidthMin, collapsedAutoWidthMax) })} />
        </>
      )}
      {!settings.collapsedAutoWidth && (
        <SettingsNumberRow indent title={text.width} unit={text.unit} value={settings.collapsedWidth}
          min={COLLAPSED_WIDTH.min} max={COLLAPSED_WIDTH.max}
          onChange={(collapsedWidth) => onChange({ ...settings, collapsedWidth })} />
      )}
      <SettingsNumberRow title={text.height} unit={text.unit} value={settings.collapsedHeight}
        min={COLLAPSED_HEIGHT.min} max={COLLAPSED_HEIGHT.max}
        onChange={(collapsedHeight) => onChange({ ...settings, collapsedHeight })} />
      <SettingsNumberRow title={text.padding} unit={text.unit} value={settings.collapsedPadding}
        min={COLLAPSED_PADDING.min} max={COLLAPSED_PADDING.max}
        onChange={(collapsedPadding) => onChange({ ...settings, collapsedPadding })} />
    </>
  );
}
