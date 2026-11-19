import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { CollapsedDimensionRows } from "../../features/appearance/CollapsedDimensionRows";
import { CollapsedIslandSection } from "../../features/appearance/CollapsedIslandSection";
import { CollapsedLayoutEditor } from "../../features/appearance/CollapsedLayoutEditor";
import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { AppearancePresetSection } from "../../features/appearance/AppearancePresetSection";
import { CollapsedCornerRow, ExpandedCornerRow, IslandShapeRows } from "../../features/appearance/IslandCornerRows";
import { IslandPreview } from "../../features/appearance/IslandPreview";
import {
  CollapsedScaleRow, ExpandedScaleRow, FontRows, MaterialRows, OpacityRow, PageButtonsRow, SchemeRow,
} from "../../features/appearance/StyleRows";
import { TopEdgeShoulderRows } from "../../features/appearance/TopEdgeShoulderRows";
import { TuckLookRows } from "../../features/appearance/TuckLookRows";
import type { IslandSettings } from "../../features/appearance/types";
import { requestPanelPreview } from "./storage";
import { appearancePreviewMode } from "./appearancePreview";

/**
 * Settings → Appearance (docs/design/settings.md, 2026-11-19), grouped by the part of the island a
 * setting changes: a preview; the theme (scheme, material, opacity, corner shape) and colours; the
 * font; the collapsed bar (its size and corners, what sits where, what it shows first); the open
 * island (its size, corners and page buttons); the top of the screen (the curves into the edge and
 * the tucked look); and last the whole-look presets.
 */
export function AppearanceSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.appearance;
  const [expandedScalePreview, setExpandedScalePreview] = useState<number | null>(null);
  const [fontSizePreview, setFontSizePreview] = useState<number | null>(null);
  const updateAppearance = (next: IslandSettings) => {
    onSettingsChange(next);
    const mode = appearancePreviewMode(settings, next);
    if (mode) requestPanelPreview(mode);
  };
  const rows = { settings, onSettingsChange: updateAppearance };
  const shapeRows = { settings, onChange: updateAppearance };
  return (
    <>
      <IslandPreview settings={{
        ...settings,
        expandedScale: expandedScalePreview ?? settings.expandedScale,
        islandFontPercent: fontSizePreview ?? settings.islandFontPercent,
      }} />
      <SettingsGroup title={text.themeTitle}>
        <SchemeRow {...rows} />
        <MaterialRows {...rows} />
        <OpacityRow {...rows} />
        <IslandShapeRows {...shapeRows} />
      </SettingsGroup>
      <ColorSettingsSection {...rows} />
      <SettingsGroup title={text.textSizeTitle}>
        <FontRows {...rows} onFontSizePreview={setFontSizePreview} />
      </SettingsGroup>
      <SettingsGroup title={text.collapsedTitle} footer={text.collapsedDimensions.hint}>
        <CollapsedScaleRow {...rows} />
        <CollapsedDimensionRows settings={settings} onChange={updateAppearance} />
        <CollapsedCornerRow {...shapeRows} />
      </SettingsGroup>
      <CollapsedLayoutEditor {...rows} />
      <CollapsedIslandSection {...rows} />
      <SettingsGroup title={text.expandedTitle}>
        <ExpandedScaleRow {...rows} onExpandedScalePreview={setExpandedScalePreview} />
        <ExpandedCornerRow {...shapeRows} />
        <PageButtonsRow {...rows} />
      </SettingsGroup>
      <SettingsGroup title={text.topEdgeTitle}>
        {settings.islandShape !== "capsule" && <TopEdgeShoulderRows {...shapeRows} />}
        <TuckLookRows {...rows} onPreviewTuck={() => requestPanelPreview("tucked")} />
      </SettingsGroup>
      <AppearancePresetSection {...rows} />
    </>
  );
}
