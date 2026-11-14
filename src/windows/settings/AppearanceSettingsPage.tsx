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
  return (
    <>
      <IslandPreview settings={{
        ...settings,
        expandedScale: expandedScalePreview ?? settings.expandedScale,
        islandFontPercent: fontSizePreview ?? settings.islandFontPercent,
      }} />
      <StyleSettingsSection
        settings={settings}
        onSettingsChange={onSettingsChange}
        onPreviewIsland={requestPanelPreview}
        onExpandedScalePreview={setExpandedScalePreview}
        onFontSizePreview={setFontSizePreview}
      />
      <CollapsedDimensionsSection settings={settings} onChange={(next) => {
        onSettingsChange(next);
        requestPanelPreview("collapsed");
      }} />
      <CollapsedLayoutEditor settings={settings} onSettingsChange={onSettingsChange} />
      <TopEdgeShouldersSection settings={settings} onChange={onSettingsChange} />
      <CollapsedIslandSection settings={settings} onSettingsChange={onSettingsChange} />
      <ColorSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
