import { useTranslation } from "../../i18n";
import { NumberControl } from "../../components/controls/NumberControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { IslandSettings } from "./types";

export function TodoSettingsSection({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--todo">
      <div className="settings-section__header">
        <span>{t.settings.todo.title}</span>
      </div>
      <ToggleControl
        label={t.settings.layout.showIdleTodoCount}
        checked={settings.showIdleTodoCount}
        onChange={(showIdleTodoCount) =>
          onSettingsChange({ ...settings, showIdleTodoCount })
        }
      />
      <ToggleControl
        label={t.settings.todo.carryOverIncomplete}
        checked={settings.carryOverIncompleteTodos}
        onChange={(carryOverIncompleteTodos) =>
          onSettingsChange({ ...settings, carryOverIncompleteTodos })
        }
      />
      <ToggleControl
        label={t.settings.todo.enableReorder}
        checked={settings.enableTodoReorder}
        onChange={(enableTodoReorder) =>
          onSettingsChange({ ...settings, enableTodoReorder })
        }
      />
      <ToggleControl
        label={t.settings.todo.rotateTodos}
        checked={settings.rotateTodos}
        onChange={(rotateTodos) => onSettingsChange({ ...settings, rotateTodos })}
      />
      {settings.rotateTodos && (
        <NumberControl
          label={t.settings.todo.rotationSeconds}
          value={settings.todoRotationSeconds}
          min={1}
          max={3_600}
          onChange={(todoRotationSeconds) => onSettingsChange({ ...settings, todoRotationSeconds })}
        />
      )}
    </section>
  );
}
