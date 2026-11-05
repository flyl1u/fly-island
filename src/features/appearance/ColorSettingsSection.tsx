import { useTranslation } from "../../i18n";
import { ColorControl } from "../../components/controls/ColorControl";
import { SliderControl } from "../../components/controls/SliderControl";
import type { IslandSettings } from "./types";
import "./ColorSettingsSection.css";

export function ColorSettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--colors">
      <div className="settings-section__header">
        <span>{t.settings.colors.title}</span>
      </div>
      <div className="color-grid">
        <ColorControl
          label={t.settings.colors.taskText}
          value={settings.taskTextColor}
          onChange={(taskTextColor) =>
            onSettingsChange({ ...settings, taskTextColor })
          }
        />
        <ColorControl
          label={t.settings.colors.pulse}
          value={settings.pulseColor}
          onChange={(pulseColor) =>
            onSettingsChange({ ...settings, pulseColor })
          }
        />
        <ColorControl
          label={t.settings.colors.islandBackground}
          value={settings.islandBackgroundColor}
          onChange={(islandBackgroundColor) =>
            onSettingsChange({ ...settings, islandBackgroundColor })
          }
        />
        <ColorControl
          label={t.settings.colors.todoPaper}
          value={settings.todoBackgroundColor}
          onChange={(todoBackgroundColor) =>
            onSettingsChange({ ...settings, todoBackgroundColor })
          }
        />
      </div>
      <SliderControl
        label={t.settings.colors.pulseBrightness}
        value={settings.pulseBrightness}
        min={50}
        max={160}
        step={1}
        suffix="%"
        onChange={(pulseBrightness) =>
          onSettingsChange({ ...settings, pulseBrightness })
        }
      />
    </section>
  );
}
