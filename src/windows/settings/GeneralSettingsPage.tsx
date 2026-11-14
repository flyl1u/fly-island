import { useTranslation, type LocaleCode } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { BehaviorSettingsSection } from "../../features/appearance/BehaviorSettingsSection";
import { ExpandRows, GameModeRow, PositionRows, TuckRows } from "../../features/appearance/IslandBehaviorRows";
import { KeepVisibleSettingsSection } from "../../features/appearance/KeepVisibleSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { requestIslandPositionReset, requestPanelPreview } from "./storage";
import { useLaunchAtStartup } from "./useLaunchAtStartup";

/**
 * Settings → General, most used first (docs/design/settings.md): startup and language; opening and
 * closing; tucking to the edge, then when not to; the position last.
 */
export function GeneralSettingsPage({
  locale,
  settings,
  detachedSettings,
  onLocaleChange,
  onSettingsChange,
  onDetachedSettingsChange,
}: {
  locale: LocaleCode;
  settings: IslandSettings;
  detachedSettings: boolean;
  onLocaleChange: (locale: LocaleCode) => void;
  onSettingsChange: (settings: IslandSettings) => void;
  onDetachedSettingsChange: (detached: boolean) => void;
}) {
  const t = useTranslation();
  const [launchAtStartup, updateLaunchAtStartup] = useLaunchAtStartup();
  const rows = { settings, onSettingsChange };

  return (
    <>
      <BehaviorSettingsSection
        launchAtStartup={launchAtStartup}
        locale={locale}
        detachedSettings={detachedSettings}
        onDetachedSettingsChange={onDetachedSettingsChange}
        onLaunchAtStartupChange={updateLaunchAtStartup}
        onLocaleChange={onLocaleChange}
      />
      <SettingsGroup title={t.settings.expand.title}>
        <ExpandRows {...rows} />
        <GameModeRow {...rows} />
      </SettingsGroup>
      <SettingsGroup title={t.settings.expand.tuckTitle}>
        <TuckRows {...rows} onPreviewTuck={() => requestPanelPreview("tucked")} />
      </SettingsGroup>
      <KeepVisibleSettingsSection {...rows} />
      <SettingsGroup title={t.settings.position.title} footer={settings.positionLocked ? undefined : t.settings.position.moveHint}>
        <PositionRows {...rows} onResetPosition={requestIslandPositionReset} />
      </SettingsGroup>
    </>
  );
}
