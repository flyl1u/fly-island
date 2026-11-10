import { CollapsedIslandSection } from "../../features/appearance/CollapsedIslandSection";
import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { IslandPreview } from "../../features/appearance/IslandPreview";
import { StyleSettingsSection } from "../../features/appearance/StyleSettingsSection";
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
  return (
    <>
      <IslandPreview settings={settings} />
      <StyleSettingsSection
        settings={settings}
        onSettingsChange={onSettingsChange}
        onPreviewIsland={() => requestPanelPreview("collapsed")}
      />
      <CollapsedIslandSection settings={settings} onSettingsChange={onSettingsChange} />
      <ColorSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
