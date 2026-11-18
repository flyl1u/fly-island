import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsSliderRow } from "../../components/settings/SettingsSliderRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { TODO_ROTATION_SECONDS, TODO_SCROLL_SPEED, TODO_VISIBLE_ROWS } from "../../features/appearance/settingsLimits";
import type { IslandSettings } from "../../features/appearance/types";
import { SavePathSettingsSection } from "../../features/todos/SavePathSettingsSection";
import type { useSaveDirectorySetting } from "../../features/todos/useSaveDirectorySetting";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** Settings → Todos: the module switch, the list, the focus timer, the collapsed island, and where todos are saved. */
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
        <SettingsNumberRow
          title={t.settings.todo.visibleRows}
          value={settings.todoVisibleRows}
          min={TODO_VISIBLE_ROWS.min}
          max={TODO_VISIBLE_ROWS.max}
          onChange={(todoVisibleRows) => onSettingsChange({ ...settings, todoVisibleRows })}
        />
      </SettingsGroup>
      <SettingsGroup title={t.settings.todo.timerTitle}>
        <SettingsToggleRow
          title={t.settings.todo.focusTimer}
          description={t.settings.todo.focusTimerDescription}
          checked={settings.todoTimerEnabled}
          onChange={(todoTimerEnabled) => onSettingsChange({ ...settings, todoTimerEnabled })}
        />
        {settings.todoTimerEnabled && <SettingsToggleRow indent
          title={t.settings.todo.timerReminder}
          description={t.settings.todo.timerReminderDescription}
          checked={settings.todoTimerReminder}
          onChange={(todoTimerReminder) => onSettingsChange({ ...settings, todoTimerReminder })}
        />}
        {settings.todoTimerEnabled && settings.todoTimerReminder && <SettingsToggleRow indent
          title={t.settings.todo.timerReminderSound}
          checked={settings.todoTimerReminderSound}
          onChange={(todoTimerReminderSound) => onSettingsChange({ ...settings, todoTimerReminderSound })}
        />}
      </SettingsGroup>
      <SettingsGroup title={t.settings.todo.collapsedTitle}>
        <SettingsToggleRow title={t.settings.todo.rotateTodos} checked={settings.rotateTodos}
          onChange={(rotateTodos) => onSettingsChange({ ...settings, rotateTodos })} />
        {settings.rotateTodos && <>
          <SettingsRow title={t.settings.todo.rotationMode} indent control={
            <SettingsChoice value={settings.todoRotationMode} ariaLabel={t.settings.todo.rotationMode}
              options={[
                { value: "switch", label: t.settings.todo.switchMode },
                { value: "scroll", label: t.settings.todo.scrollMode },
              ]} onChange={(todoRotationMode) => onSettingsChange({ ...settings, todoRotationMode })} />
          } />
          {settings.todoRotationMode === "switch" ? (
            <SettingsNumberRow title={t.settings.todo.rotationSeconds} value={settings.todoRotationSeconds}
              min={TODO_ROTATION_SECONDS.min} max={TODO_ROTATION_SECONDS.max} unit={t.settings.expand.secondsUnit} indent
              onChange={(todoRotationSeconds) => onSettingsChange({ ...settings, todoRotationSeconds })} />
          ) : (
            <SettingsSliderRow title={t.settings.todo.scrollSpeed} value={settings.todoScrollSpeed}
              min={TODO_SCROLL_SPEED.min} max={TODO_SCROLL_SPEED.max} step={TODO_SCROLL_SPEED.step} indent
              format={t.settings.todo.scrollSpeedValue}
              onChange={(todoScrollSpeed) => onSettingsChange({ ...settings, todoScrollSpeed })} />
          )}
        </>}
      </SettingsGroup>
      <SavePathSettingsSection
        saveDirectoryDraft={saveDirectory.saveDirectoryDraft}
        savePathState={saveDirectory.savePathState}
        highlightSavePath={saveDirectory.highlightSavePath}
        onSaveDirectoryDraftChange={saveDirectory.onSaveDirectoryDraftChange}
        onSaveDirectory={saveDirectory.onSaveDirectory}
        onPickDirectory={saveDirectory.onPickDirectory}
      />
    </>
  );
}
