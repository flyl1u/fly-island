import { RotateCcw } from "lucide-react";
import { SliderControl } from "../../components/controls/SliderControl";
import { useTranslation } from "../../i18n";
import type { IslandSettings } from "./types";
import "./PositionSettingsSection.css";

/** Where the island sits: its top margin, how to drag it, and a way back to the default. */
export function PositionSettingsSection({
  settings,
  onSettingsChange,
  onResetPosition,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  onResetPosition: () => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--position">
      <div className="settings-section__header position-settings__header">
        <span>{t.settings.position.title}</span>
        <button
          className="position-settings__reset"
          type="button"
          title={t.settings.position.resetHint}
          onClick={onResetPosition}
        >
          <RotateCcw size={12} strokeWidth={2.4} aria-hidden="true" />
          <span>{t.settings.position.reset}</span>
        </button>
      </div>
      <SliderControl
        label={t.settings.layout.marginY}
        value={settings.marginY}
        min={0}
        max={160}
        step={1}
        suffix="px"
        onChange={(marginY) => onSettingsChange({ ...settings, marginY })}
      />
      <p className="settings-section__hint">{t.settings.position.moveHint}</p>
    </section>
  );
}
