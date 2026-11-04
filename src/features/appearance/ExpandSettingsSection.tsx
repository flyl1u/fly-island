import { useTranslation } from "../../i18n";
import { NumberControl } from "../../components/controls/NumberControl";
import { SliderControl } from "../../components/controls/SliderControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { MAX_HOVER_COLLAPSE_DELAY_MS, MAX_HOVER_EXPAND_DELAY_MS, MIN_HOVER_COLLAPSE_DELAY_MS, MIN_HOVER_EXPAND_DELAY_MS } from "./settings";
import type { ExpandTrigger, IslandSettings } from "./types";
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
      <ToggleControl
        label={t.settings.layout.autoTuck}
        checked={settings.autoTuck}
        onChange={(autoTuck) => onSettingsChange({ ...settings, autoTuck })}
      />
      {settings.autoTuck && (
        <NumberControl
          label={t.settings.layout.autoTuckSeconds}
          value={settings.autoTuckSeconds}
          min={1}
          max={3_600}
          onChange={(autoTuckSeconds) => onSettingsChange({ ...settings, autoTuckSeconds })}
        />
      )}
      <ToggleControl
        label={t.settings.expand.revealOnMessage}
        checked={settings.revealOnMessage}
        onChange={(revealOnMessage) => onSettingsChange({ ...settings, revealOnMessage })}
      />
    </section>
  );
}
