import { TodoSettingsSection } from "../../features/appearance/TodoSettingsSection";
import type { IslandSettings } from "../../features/appearance/types";
import { SavePathSettingsSection } from "../../features/todos/SavePathSettingsSection";
import type { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";

export function TodosSettingsPage({
  settings,
  saveDirectory,
  onSettingsChange,
}: {
  settings: IslandSettings;
  saveDirectory: ReturnType<typeof useSaveDirectorySetting>;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  return (
    <>
      <TodoSettingsSection settings={settings} onSettingsChange={onSettingsChange} />
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
