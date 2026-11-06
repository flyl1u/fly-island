import { useTranslation } from "../../i18n";
import { NumberControl } from "../../components/controls/NumberControl";
import { SliderControl } from "../../components/controls/SliderControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import {
  MAX_AUTO_TUCK_RETRACT_DELAY_MS,
  MAX_HOVER_COLLAPSE_DELAY_MS,
  MAX_HOVER_EXPAND_DELAY_MS,
  MIN_AUTO_TUCK_RETRACT_DELAY_MS,
  MIN_HOVER_COLLAPSE_DELAY_MS,
  MIN_HOVER_EXPAND_DELAY_MS,
} from "./settings";
import type { ExpandTrigger, IslandSettings, MinimizeAction, TuckedHoverAction } from "./types";
import "./AppearanceModeControl.css";

export function ExpandSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const triggers: [ExpandTrigger, string][] = [
    ["click", t.settings.expand.click],
    ["hover", t.settings.expand.hover],
  ];
  const tuckedHoverActions: [TuckedHoverAction, string][] = [
    ["reveal", t.settings.expand.tuckedHoverReveal],
    ["expand", t.settings.expand.tuckedHoverExpand],
  ];
  const minimizeActions: [MinimizeAction, string][] = [
    ["tray", t.settings.layout.minimizeToTray],
    ["tuck", t.settings.layout.minimizeToTop],
  ];

  return (
    <section className="settings-section settings-section--expand">
      <div className="settings-section__header">
        <span>{t.settings.expand.title}</span>
      </div>
      <div className="appearance-mode-control">
        <span>{t.settings.expand.trigger}</span>
        <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.expand.trigger}>
          {triggers.map(([expandTrigger, label]) => (
            <button
              key={expandTrigger}
              className={settings.expandTrigger === expandTrigger ? "appearance-mode-control--active" : ""}
              type="button"
              aria-pressed={settings.expandTrigger === expandTrigger}
              onClick={() => onSettingsChange({ ...settings, expandTrigger })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {settings.expandTrigger === "hover" && (
        <>
          <SliderControl
            label={t.settings.expand.hoverDelay}
            value={settings.hoverExpandDelayMs}
            min={MIN_HOVER_EXPAND_DELAY_MS}
            max={MAX_HOVER_EXPAND_DELAY_MS}
            step={50}
            suffix="ms"
            onChange={(hoverExpandDelayMs) => onSettingsChange({ ...settings, hoverExpandDelayMs })}
          />
          <SliderControl
            label={t.settings.expand.hoverCollapseDelay}
            value={settings.hoverCollapseDelayMs}
            min={MIN_HOVER_COLLAPSE_DELAY_MS}
            max={MAX_HOVER_COLLAPSE_DELAY_MS}
            step={50}
            suffix="ms"
            onChange={(hoverCollapseDelayMs) => onSettingsChange({ ...settings, hoverCollapseDelayMs })}
          />
        </>
      )}
      <div className="appearance-mode-control">
        <span>{t.settings.layout.minimizeAction}</span>
        <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.layout.minimizeAction}>
          {minimizeActions.map(([minimizeAction, label]) => (
            <button
              key={minimizeAction}
              className={settings.minimizeAction === minimizeAction ? "appearance-mode-control--active" : ""}
              type="button"
              aria-pressed={settings.minimizeAction === minimizeAction}
              onClick={() => onSettingsChange({ ...settings, minimizeAction })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="appearance-mode-control">
        <span>{t.settings.expand.tuckedHover}</span>
        <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.expand.tuckedHover}>
          {tuckedHoverActions.map(([tuckedHoverAction, label]) => (
            <button
              key={tuckedHoverAction}
              className={settings.tuckedHoverAction === tuckedHoverAction ? "appearance-mode-control--active" : ""}
              type="button"
              aria-pressed={settings.tuckedHoverAction === tuckedHoverAction}
              onClick={() => onSettingsChange({ ...settings, tuckedHoverAction })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ToggleControl
        label={t.settings.layout.autoTuck}
        checked={settings.autoTuck}
        onChange={(autoTuck) => onSettingsChange({ ...settings, autoTuck })}
      />
      {settings.autoTuck && (
        <>
          <NumberControl
            label={t.settings.layout.autoTuckSeconds}
            value={settings.autoTuckSeconds}
            min={1}
            max={3_600}
            onChange={(autoTuckSeconds) => onSettingsChange({ ...settings, autoTuckSeconds })}
          />
          <ToggleControl
            label={t.settings.layout.autoTuckRetract}
            checked={settings.autoTuckRetract}
            onChange={(autoTuckRetract) => onSettingsChange({ ...settings, autoTuckRetract })}
          />
          {settings.autoTuckRetract && (
            <SliderControl
              label={t.settings.layout.autoTuckRetractDelay}
              value={settings.autoTuckRetractDelayMs}
              min={MIN_AUTO_TUCK_RETRACT_DELAY_MS}
              max={MAX_AUTO_TUCK_RETRACT_DELAY_MS}
              step={100}
              suffix="ms"
              onChange={(autoTuckRetractDelayMs) => onSettingsChange({ ...settings, autoTuckRetractDelayMs })}
            />
          )}
        </>
      )}
      <ToggleControl
        label={t.settings.expand.revealOnMessage}
        checked={settings.revealOnMessage}
        onChange={(revealOnMessage) => onSettingsChange({ ...settings, revealOnMessage })}
      />
    </section>
  );
}
