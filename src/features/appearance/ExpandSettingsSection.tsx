import { useTranslation } from "../../i18n";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AUTO_COLLAPSE_SECONDS } from "./settingsLimits";
import type { ExpandTrigger, IslandSettings } from "./types";

/**
 * Settings → General → Island: how the island opens, how long an open panel stays without use,
 * whether it tucks to the top edge when idle,
 * game mode, and a way back to its default position. Timings, the monitor, the margin and
 * tucking while full screen keep their defaults (settingsDefaults.ts).
 */
export function ExpandSettingsSection({
  settings,
  onSettingsChange,
  onResetPosition,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onResetPosition: () => void;
}) {
  const t = useTranslation();
  const expand = t.settings.expand;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const triggers: { value: ExpandTrigger; label: string }[] = [
    { value: "click", label: expand.click },
    { value: "hover", label: expand.hover },
  ];
  const collapseOptions = AUTO_COLLAPSE_SECONDS.map((seconds) => ({
    value: String(seconds),
    label: seconds === 0 ? expand.never : expand.seconds(seconds),
  }));

  return (
    <SettingsGroup title={expand.title} footer={settings.positionLocked ? undefined : t.settings.position.moveHint}>
      <SettingsRow
        title={expand.trigger}
        control={
          <SettingsChoice
            value={settings.expandTrigger}
            options={triggers}
            ariaLabel={expand.trigger}
            onChange={(expandTrigger) => update({ expandTrigger })}
          />
        }
      />
      <SettingsRow
        title={expand.autoCollapse}
        description={expand.autoCollapseHint}
        control={
          <SettingsSelect
            value={String(settings.autoCollapseSeconds)}
            options={collapseOptions}
            ariaLabel={expand.autoCollapse}
            onChange={(seconds) => update({ autoCollapseSeconds: Number(seconds) })}
          />
        }
      />
      <SettingsToggleRow
        title={t.settings.layout.autoTuck}
        description={t.settings.layout.autoTuckHint}
        checked={settings.autoTuck}
        onChange={(autoTuck) => update({ autoTuck })}
      />
      <SettingsToggleRow
        title={t.settings.layout.gameQuiet}
        description={t.settings.layout.gameQuietHint}
        checked={settings.gameDoNotDisturb}
        onChange={(gameDoNotDisturb) => update({ gameDoNotDisturb })}
      />
      <SettingsRow
        title={t.settings.position.resetRow}
        control={<SettingsLinkButton onClick={onResetPosition}>{t.settings.position.reset}</SettingsLinkButton>}
      />
      <SettingsToggleRow
        title={t.settings.position.lock}
        description={t.settings.position.lockHint}
        checked={settings.positionLocked}
        onChange={(positionLocked) => update({ positionLocked })}
      />
    </SettingsGroup>
  );
}
