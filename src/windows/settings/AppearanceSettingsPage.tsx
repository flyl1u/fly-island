import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { IslandPreview } from "../../features/appearance/IslandPreview";
import { StyleSettingsSection } from "../../features/appearance/StyleSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { requestPanelPreview } from "./storage";

/** Settings → Appearance: a preview, then style (font, opacity, size) and the three colours. */
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
      <ColorSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
    </>
  );
}
