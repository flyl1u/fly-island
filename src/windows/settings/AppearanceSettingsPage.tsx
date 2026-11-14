import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { CollapsedDimensionRows } from "../../features/appearance/CollapsedDimensionRows";
import { CollapsedIslandSection } from "../../features/appearance/CollapsedIslandSection";
import { CollapsedLayoutEditor } from "../../features/appearance/CollapsedLayoutEditor";
import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { IslandPreview } from "../../features/appearance/IslandPreview";
import { FontRows, MaterialRows, OpacityRow, PageButtonsRow, ScaleRows, SchemeRow } from "../../features/appearance/StyleRows";
import { TopEdgeShoulderRows } from "../../features/appearance/TopEdgeShoulderRows";
import type { IslandSettings } from "../../features/appearance/types";
import { requestPanelPreview } from "./storage";
import { appearancePreviewMode } from "./appearancePreview";

/**
 * Settings → Appearance (docs/design/settings.md): a preview, then the theme and its colours, the
 * text and sizes, what sits where on the island, and last the notch and the top-edge curves.
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
      </SettingsGroup>
      <ColorSettingsSection {...rows} />
      <SettingsGroup title={text.textSizeTitle}>
        <FontRows {...rows} onFontSizePreview={setFontSizePreview} />
        <ScaleRows {...rows} onExpandedScalePreview={setExpandedScalePreview} />
      </SettingsGroup>
      <CollapsedLayoutEditor {...rows}>
        <PageButtonsRow {...rows} />
      </CollapsedLayoutEditor>
      <CollapsedIslandSection {...rows} />
      <SettingsGroup title={text.shapeTitle} footer={text.collapsedDimensions.hint}>
        <CollapsedDimensionRows settings={settings} onChange={updateAppearance} />
        <TopEdgeShoulderRows settings={settings} onChange={updateAppearance} />
      </SettingsGroup>
    </>
  );
}
