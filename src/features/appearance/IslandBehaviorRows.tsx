import { useTranslation } from "../../i18n";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { AUTO_COLLAPSE_SECONDS, TUCK_DELAY_SECONDS } from "./settingsLimits";
import type { ExpandTrigger, IslandSettings, TuckStyle } from "./types";

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
    </>
  );
}

/** Whether and (B) how soon the collapsed island tucks to the top edge, and how it looks there. */
export function TuckRows({ settings, onSettingsChange, onPreviewTuck }: RowsProps & { onPreviewTuck?: () => void }) {
  const t = useTranslation();
  const expand = t.settings.expand;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const tuckStyles: { value: TuckStyle; label: string }[] = (["edge", "line", "hidden"] as const).map((value) => ({
    value,
    label: expand.tuckStyles[value],
  }));
  return (
    <>
      <SettingsToggleRow
        title={t.settings.layout.autoTuck}
        description={t.settings.layout.autoTuckHint}
        checked={settings.autoTuck}
        onChange={(autoTuck) => update({ autoTuck })}
      />
      {settings.autoTuck ? (
        <SettingsNumberRow
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
      {/* Clicking "tuck to the top" tucks it too, so the look is offered with auto-tuck off. */}
      <SettingsRow
        title={expand.tuckStyle}
        control={
          <SettingsChoice
            value={settings.tuckStyle}
            options={tuckStyles}
            ariaLabel={expand.tuckStyle}
            onChange={(tuckStyle) => { update({ tuckStyle }); onPreviewTuck?.(); }}
          />
        }
      />
    </>
  );
}

/** Game mode: a full-screen game, video or slideshow in front keeps the island quiet. */
export function GameModeRow({ settings, onSettingsChange }: RowsProps) {
  const layout = useTranslation().settings.layout;
  return (
    <SettingsToggleRow
      title={layout.gameQuiet}
      description={layout.gameQuietHint}
      checked={settings.gameDoNotDisturb}
      onChange={(gameDoNotDisturb) => onSettingsChange({ ...settings, gameDoNotDisturb })}
    />
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
