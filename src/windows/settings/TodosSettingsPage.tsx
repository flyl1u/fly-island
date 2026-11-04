import { TodoSettingsSection } from "../../features/appearance/TodoSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { LocalApiSettingsSection } from "../../features/local-api/LocalApiSettingsSection";
import { SavePathSettingsSection } from "../../features/todos/SavePathSettingsSection";
import type { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

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
      <TodoSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
      <SavePathSettingsSection
        saveDirectoryDraft={saveDirectory.saveDirectoryDraft}
        savePathState={saveDirectory.savePathState}
        highlightSavePath={saveDirectory.highlightSavePath}
        onSaveDirectoryDraftChange={saveDirectory.onSaveDirectoryDraftChange}
        onSaveDirectory={saveDirectory.onSaveDirectory}
      />
      <LocalApiSettingsSection />
    </>
  );
}
