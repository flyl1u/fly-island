import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { FontRows, MaterialRows, OpacityRow, PageButtonsRow, ScaleRows, SchemeRow } from "./StyleRows";
import type { IslandSettings } from "./types";

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
  const text = useTranslation().settings.appearance;
  const rows = { settings, onSettingsChange };
  return (
    <SettingsGroup title={text.styleTitle}>
      <SchemeRow {...rows} />
      <MaterialRows {...rows} />
      <FontRows {...rows} onFontSizePreview={onFontSizePreview} />
      <PageButtonsRow {...rows} />
      <OpacityRow {...rows} />
      <ScaleRows {...rows} onPreviewIsland={onPreviewIsland} onExpandedScalePreview={onExpandedScalePreview} />
    </SettingsGroup>
  );
}
