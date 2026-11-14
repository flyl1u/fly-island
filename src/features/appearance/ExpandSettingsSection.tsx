import { useTranslation } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { ExpandRows, GameModeRow, PositionRows, TuckRows } from "./IslandBehaviorRows";
import type { IslandSettings } from "./types";

/**
 * Settings → General → Island: how the island opens, (A) how long the open island stays after the
 * cursor leaves, whether and (B) how soon the collapsed island tucks to the top edge, how it looks
 * there, game mode, and a way back to its default position. Timings, the monitor, the margin and
 * tucking while full screen keep their defaults (settingsDefaults.ts).
 */
export function ExpandSettingsSection({
  settings,
  onSettingsChange,
  onResetPosition,
  onPreviewTuck,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onResetPosition: () => void;
  onPreviewTuck?: () => void;
}) {
  const t = useTranslation();
  const rows = { settings, onSettingsChange };
  return (
    <SettingsGroup title={t.settings.expand.title} footer={settings.positionLocked ? undefined : t.settings.position.moveHint}>
      <ExpandRows {...rows} />
      <TuckRows {...rows} onPreviewTuck={onPreviewTuck} />
      <GameModeRow {...rows} />
      <PositionRows {...rows} onResetPosition={onResetPosition} />
    </SettingsGroup>
  );
}
