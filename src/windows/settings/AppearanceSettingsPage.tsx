import { useState } from "react";
import { CollapsedDimensionsSection } from "../../features/appearance/CollapsedDimensionsSection";
import { CollapsedIslandSection } from "../../features/appearance/CollapsedIslandSection";
import { CollapsedLayoutEditor } from "../../features/appearance/CollapsedLayoutEditor";
import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { IslandPreview } from "../../features/appearance/IslandPreview";
import { StyleSettingsSection } from "../../features/appearance/StyleSettingsSection";
import { TopEdgeShouldersSection } from "../../features/appearance/TopEdgeShouldersSection";
import type { IslandSettings } from "../../features/appearance/types";
import { requestPanelPreview } from "./storage";
import { appearancePreviewMode } from "./appearancePreview";

/**
 * Settings → Appearance: a preview, then style (font, opacity, size), what the collapsed island
 * shows first, and the three colours.
 */
export function AppearanceSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const [expandedScalePreview, setExpandedScalePreview] = useState<number | null>(null);
  const [fontSizePreview, setFontSizePreview] = useState<number | null>(null);
  const updateAppearance = (next: IslandSettings) => {
    onSettingsChange(next);
    const mode = appearancePreviewMode(settings, next);
    if (mode) requestPanelPreview(mode);
  };
  return (
    <>
      <IslandPreview settings={{
        ...settings,
        expandedScale: expandedScalePreview ?? settings.expandedScale,
        islandFontPercent: fontSizePreview ?? settings.islandFontPercent,
      }} />
      <StyleSettingsSection
        settings={settings}
        onSettingsChange={updateAppearance}
        onExpandedScalePreview={setExpandedScalePreview}
        onFontSizePreview={setFontSizePreview}
      />
      <CollapsedDimensionsSection settings={settings} onChange={updateAppearance} />
      <CollapsedLayoutEditor settings={settings} onSettingsChange={updateAppearance} />
      <TopEdgeShouldersSection settings={settings} onChange={updateAppearance} />
      <CollapsedIslandSection settings={settings} onSettingsChange={updateAppearance} />
      <ColorSettingsSection settings={settings} onSettingsChange={updateAppearance} />
    </>
  );
}
