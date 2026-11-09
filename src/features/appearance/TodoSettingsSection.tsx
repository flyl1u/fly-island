import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { IslandSettings } from "./types";

/** Todos → Todos: what the collapsed island shows, carrying unfinished ones over, order and rotation. */
export function TodoSettingsSection({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const toggle = (key: "showIdleTodoCount" | "carryOverIncompleteTodos" | "enableTodoReorder" | "rotateTodos", title: string) => (
    <SettingsToggleRow title={title} checked={settings[key]} onChange={(value) => onSettingsChange({ ...settings, [key]: value })} />
  );

  return (
    <SettingsGroup title={t.settings.todo.title}>
      {toggle("showIdleTodoCount", t.settings.layout.showIdleTodoCount)}
      {toggle("carryOverIncompleteTodos", t.settings.todo.carryOverIncomplete)}
      {toggle("enableTodoReorder", t.settings.todo.enableReorder)}
      {toggle("rotateTodos", t.settings.todo.rotateTodos)}
      {settings.rotateTodos && (
        <SettingsNumberRow
          title={t.settings.todo.rotationSeconds}
          indent
          value={settings.todoRotationSeconds}
          min={1}
          max={3_600}
          onChange={(todoRotationSeconds) => onSettingsChange({ ...settings, todoRotationSeconds })}
        />
      )}
    </SettingsGroup>
  );
}
