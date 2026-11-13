import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "../../features/appearance/types";
import { SavePathSettingsSection } from "../../features/todos/SavePathSettingsSection";
import type { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** Settings → Todos: the module switch, carrying unfinished todos over, and where they are saved. */
export function TodosSettingsPage({
  settings,
  saveDirectory,
  onSettingsChange,
}: {
  settings: IslandSettings;
  saveDirectory: ReturnType<typeof useSaveDirectorySetting>;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <>
      <ModuleSwitchSection
        label={t.settings.modules.todo}
        checked={settings.todoEnabled}
        onChange={(todoEnabled) => onSettingsChange({ ...settings, todoEnabled })}
      />
      <SettingsGroup title={t.settings.todo.title}>
        <SettingsToggleRow
          title={t.settings.todo.carryOverIncomplete}
          checked={settings.carryOverIncompleteTodos}
          onChange={(carryOverIncompleteTodos) => onSettingsChange({ ...settings, carryOverIncompleteTodos })}
        />
        <SettingsToggleRow
          title={t.settings.todo.dragToReorder}
          description={t.settings.todo.dragToReorderDescription}
          checked={settings.enableTodoReorder}
          onChange={(enableTodoReorder) => onSettingsChange({ ...settings, enableTodoReorder, todoReorderVersion: 1 })}
        />
      </SettingsGroup>
      <SavePathSettingsSection
        saveDirectoryDraft={saveDirectory.saveDirectoryDraft}
        savePathState={saveDirectory.savePathState}
        highlightSavePath={saveDirectory.highlightSavePath}
        onSaveDirectoryDraftChange={saveDirectory.onSaveDirectoryDraftChange}
        onSaveDirectory={saveDirectory.onSaveDirectory}
      />
    </>
  );
}
