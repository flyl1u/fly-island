import { useTranslation } from "../../i18n";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AUTO_COLLAPSE_SECONDS, GAME_NOTICE_SECONDS, TUCK_DELAY_SECONDS } from "./settingsLimits";
import type { ExpandTrigger, IslandSettings } from "./types";

type RowsProps = {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
};

/** How the island opens, and (A) how long the open island stays after the cursor leaves. */
export function ExpandRows({ settings, onSettingsChange }: RowsProps) {
  const expand = useTranslation().settings.expand;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const triggers: { value: ExpandTrigger; label: string }[] = [
    { value: "click", label: expand.click },
    { value: "hover", label: expand.hover },
  ];
  return (
    <>
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
      <SettingsNumberRow
        title={expand.autoCollapse}
        description={expand.autoCollapseHint}
        value={settings.autoCollapseSeconds}
        min={AUTO_COLLAPSE_SECONDS.min}
        max={AUTO_COLLAPSE_SECONDS.max}
        unit={expand.secondsUnit}
        onChange={(autoCollapseSeconds) => update({ autoCollapseSeconds })}
      />
      <SettingsToggleRow
        title={expand.ctrlWheel}
        description={expand.ctrlWheelHint}
        checked={settings.ctrlWheelPages}
        onChange={(ctrlWheelPages) => update({ ctrlWheelPages })}
      />
    </>
  );
}

/**
 * Whether and (B) how soon the collapsed island tucks to the top edge. How it looks tucked is on
 * the appearance page (TuckLookRows.tsx, 2026-11-19).
 */
export function TuckRows({ settings, onSettingsChange }: RowsProps) {
  const t = useTranslation();
  const expand = t.settings.expand;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  return (
    <>
      <SettingsToggleRow
        title={t.settings.layout.neverAutoTuck}
        description={t.settings.layout.neverAutoTuckHint}
        checked={settings.neverAutoTuck}
        onChange={(neverAutoTuck) => update({ neverAutoTuck })}
      />
      <SettingsToggleRow
        title={t.settings.layout.autoTuck}
        description={settings.neverAutoTuck ? t.settings.layout.neverAutoTuckOverrides : t.settings.layout.autoTuckHint}
        checked={settings.autoTuck}
        disabled={settings.neverAutoTuck}
        onChange={(autoTuck) => update({ autoTuck })}
      />
      {settings.autoTuck ? (
        <SettingsNumberRow
          disabled={settings.neverAutoTuck}
          title={expand.tuckDelay}
          description={expand.tuckDelayHint}
          value={settings.tuckDelaySeconds}
          min={TUCK_DELAY_SECONDS.min}
          max={TUCK_DELAY_SECONDS.max}
          unit={expand.secondsUnit}
          indent
          onChange={(tuckDelaySeconds) => update({ tuckDelaySeconds })}
        />
      ) : null}
    </>
  );
}

/** Game mode: a full-screen game, video or slideshow in front keeps the island quiet. */
export function GameModeRow({ settings, onSettingsChange }: RowsProps) {
  const t = useTranslation();
  const layout = t.settings.layout;
  const labels = t.settings.messageSources;
  return (
    <>
    <SettingsToggleRow
      title={layout.gameQuiet}
      description={layout.gameQuietHint}
      checked={settings.gameDoNotDisturb}
      onChange={(gameDoNotDisturb) => onSettingsChange({ ...settings, gameDoNotDisturb })}
    />
    {/* Notices in game mode only matter while it is on (noticeRules.ts), so they hang under it. */}
    {settings.gameDoNotDisturb && <SettingsToggleRow indent title={labels.gameNotices} description={labels.gameNoticesHint} checked={settings.gameShowNotices}
      onChange={(gameShowNotices) => onSettingsChange({ ...settings, gameShowNotices })} />}
    {settings.gameDoNotDisturb && settings.gameShowNotices && <SettingsSliderRow indent title={labels.gameNoticeSeconds} value={settings.gameNoticeSeconds}
      min={GAME_NOTICE_SECONDS.min} max={GAME_NOTICE_SECONDS.max} step={GAME_NOTICE_SECONDS.step}
      format={(value) => `${value} ${t.settings.expand.secondsUnit}`} defaultValue={GAME_NOTICE_SECONDS.default}
      resetLabel={layout.resetToDefault} onChange={(gameNoticeSeconds) => onSettingsChange({ ...settings, gameNoticeSeconds })} />}
    </>
  );
}

/** A way back to the default position, and locking it. */
export function PositionRows({ settings, onSettingsChange, onResetPosition }: RowsProps & { onResetPosition: () => void }) {
  const position = useTranslation().settings.position;
  return (
    <>
      <SettingsRow
        title={position.resetRow}
        control={<SettingsLinkButton onClick={onResetPosition}>{position.reset}</SettingsLinkButton>}
      />
      <SettingsToggleRow
        title={position.lock}
        description={position.lockHint}
        checked={settings.positionLocked}
        onChange={(positionLocked) => onSettingsChange({ ...settings, positionLocked })}
      />
    </>
  );
}
