import { useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { CollapsedDimensionRows } from "../../features/appearance/CollapsedDimensionRows";
import { CollapsedIslandSection } from "../../features/appearance/CollapsedIslandSection";
import { CollapsedLayoutEditor } from "../../features/appearance/CollapsedLayoutEditor";
import { ColorSettingsSection } from "../../features/appearance/ColorSettingsSection";
import { AppearancePresetSection } from "../../features/appearance/AppearancePresetSection";
import { IslandCornerRows } from "../../features/appearance/IslandCornerRows";
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
 * Settings → Appearance (docs/design/settings.md, 2026-11-19): one kind of setting per group, so
 * each is found in one place: a preview; the theme; colours; the font; every size; every corner;
 * what sits where on the collapsed island and what it shows first; the tucked look; and last the
 * whole-look presets.
 */
export function AppearanceSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const text = t.settings.appearance;
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
      </SettingsGroup>
      <SettingsGroup title={text.sizeTitle} footer={text.collapsedDimensions.hint}>
        <CollapsedScaleRow {...rows} />
        <ExpandedScaleRow {...rows} onExpandedScalePreview={setExpandedScalePreview} />
        <CollapsedDimensionRows settings={settings} onChange={updateAppearance} />
      </SettingsGroup>
      <SettingsGroup title={text.cornersTitle}>
        <IslandCornerRows settings={settings} onChange={updateAppearance} />
        {settings.islandShape !== "capsule" && <TopEdgeShoulderRows settings={settings} onChange={updateAppearance} />}
      </SettingsGroup>
      <CollapsedLayoutEditor {...rows}>
        <PageButtonsRow {...rows} />
      </CollapsedLayoutEditor>
      <CollapsedIslandSection {...rows} />
      <SettingsGroup title={t.settings.expand.tuckTitle}>
        <TuckLookRows {...rows} onPreviewTuck={() => requestPanelPreview("tucked")} />
      </SettingsGroup>
      <AppearancePresetSection {...rows} />
    </>
  );
}
