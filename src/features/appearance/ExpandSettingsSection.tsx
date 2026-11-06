import { useTranslation } from "../../i18n";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import {
  DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS,
  DEFAULT_HOVER_COLLAPSE_DELAY_MS,
  DEFAULT_HOVER_EXPAND_DELAY_MS,
  MAX_AUTO_TUCK_RETRACT_DELAY_MS,
  MAX_HOVER_COLLAPSE_DELAY_MS,
  MAX_HOVER_EXPAND_DELAY_MS,
  MIN_AUTO_TUCK_RETRACT_DELAY_MS,
  MIN_HOVER_COLLAPSE_DELAY_MS,
  MIN_HOVER_EXPAND_DELAY_MS,
} from "./settings";
import type { ExpandTrigger, IslandSettings, TuckedHoverAction } from "./types";

/** Idle times offered before tucking, in seconds. A saved value outside the list is offered too. */
const IDLE_SECONDS = [5, 10, 15, 30, 60, 120, 300, 600];

/**
 * Settings → General: how the island opens, when it tucks to the screen edge, and
 * how a tucked island comes back. Rows that only matter while a switch is on sit
 * indented under it and are hidden while it is off.
 */
export function ExpandSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const layout = t.settings.layout;
  const expand = t.settings.expand;
  const update = (patch: Partial<IslandSettings>) => onSettingsChange({ ...settings, ...patch });
  const seconds = (ms: number) => layout.seconds(Number((ms / 1000).toFixed(2)));
  const idleLabel = (value: number) => (value >= 60 && value % 60 === 0 ? layout.minutes(value / 60) : layout.seconds(value));
  const idleOptions = [...new Set([...IDLE_SECONDS, settings.autoTuckSeconds])]
    .sort((a, b) => a - b)
    .map((value) => ({ value: String(value), label: idleLabel(value) }));
  const triggers: { value: ExpandTrigger; label: string }[] = [
    { value: "click", label: expand.click },
    { value: "hover", label: expand.hover },
  ];
  const tuckedHoverActions: { value: TuckedHoverAction; label: string }[] = [
    { value: "reveal", label: expand.tuckedHoverReveal },
    { value: "expand", label: expand.tuckedHoverExpand },
  ];

  return (
    <>
      <SettingsGroup title={expand.title}>
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
        {settings.expandTrigger === "hover" && (
          <>
            <SettingsSliderRow
              indent
              title={expand.hoverDelay}
              value={settings.hoverExpandDelayMs}
              min={MIN_HOVER_EXPAND_DELAY_MS}
              max={MAX_HOVER_EXPAND_DELAY_MS}
              step={50}
              format={seconds}
              defaultValue={DEFAULT_HOVER_EXPAND_DELAY_MS}
              resetLabel={layout.resetToDefault}
              onChange={(hoverExpandDelayMs) => update({ hoverExpandDelayMs })}
            />
            <SettingsSliderRow
              indent
              title={expand.hoverCollapseDelay}
              value={settings.hoverCollapseDelayMs}
              min={MIN_HOVER_COLLAPSE_DELAY_MS}
              max={MAX_HOVER_COLLAPSE_DELAY_MS}
              step={50}
              format={seconds}
              defaultValue={DEFAULT_HOVER_COLLAPSE_DELAY_MS}
              resetLabel={layout.resetToDefault}
              onChange={(hoverCollapseDelayMs) => update({ hoverCollapseDelayMs })}
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={expand.tuckTitle}>
        <SettingsToggleRow
          title={layout.autoTuck}
          description={layout.autoTuckHint}
          checked={settings.autoTuck}
          onChange={(autoTuck) => update({ autoTuck })}
        />
        {settings.autoTuck && (
          <>
            <SettingsRow
              indent
              title={layout.autoTuckSeconds}
              control={
                <SettingsSelect
                  value={String(settings.autoTuckSeconds)}
                  options={idleOptions}
                  ariaLabel={layout.autoTuckSeconds}
                  onChange={(value) => update({ autoTuckSeconds: Number(value) })}
                />
              }
            />
            <SettingsToggleRow
              indent
              title={layout.autoTuckRetract}
              checked={settings.autoTuckRetract}
              onChange={(autoTuckRetract) => update({ autoTuckRetract })}
            />
            {settings.autoTuckRetract && (
              <SettingsSliderRow
                indent
                title={layout.autoTuckRetractDelay}
                value={settings.autoTuckRetractDelayMs}
                min={MIN_AUTO_TUCK_RETRACT_DELAY_MS}
                max={MAX_AUTO_TUCK_RETRACT_DELAY_MS}
                step={100}
                format={seconds}
                defaultValue={DEFAULT_AUTO_TUCK_RETRACT_DELAY_MS}
                resetLabel={layout.resetToDefault}
                onChange={(autoTuckRetractDelayMs) => update({ autoTuckRetractDelayMs })}
              />
            )}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={expand.revealTitle}>
        <SettingsRow
          title={expand.tuckedHover}
          control={
            <SettingsChoice
              value={settings.tuckedHoverAction}
              options={tuckedHoverActions}
              ariaLabel={expand.tuckedHover}
              onChange={(tuckedHoverAction) => update({ tuckedHoverAction })}
            />
          }
        />
        <SettingsToggleRow
          title={expand.revealOnMessage}
          checked={settings.revealOnMessage}
          onChange={(revealOnMessage) => update({ revealOnMessage })}
        />
      </SettingsGroup>
    </>
  );
}
