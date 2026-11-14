import { useCallback, useEffect, useRef, useState } from "react";
import { openSettingsWindow } from "../settings/api";
import { useTodos } from "../../features/todos/useTodos";
import type { IslandSettings } from "../../features/appearance/types";
import timerSound from "../../assets/sounds/thumb-piano/complete.wav";
import { isIslandVisible } from "./api";
import type { useIslandNavigation } from "./useIslandNavigation";
import { useTranslation } from "../../i18n";
import type { ShowCollapsedNotice } from "./useCollapsedNotice";

type IslandTodosOptions = {
  settings: IslandSettings;
  navigation: Pick<ReturnType<typeof useIslandNavigation>, "collapseIsland" | "openIslandPage" | "isTucked">;
  quiet: boolean;
  onNotice?: ShowCollapsedNotice;
};

/** The todos. */
export function useIslandTodos({ settings, navigation, quiet, onNotice }: IslandTodosOptions) {
  const t = useTranslation();
  const { collapseIsland, openIslandPage, isTucked } = navigation;
  const [todoListHeight, setTodoListHeight] = useState<number | null>(null);
  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const onTimerExpired = useCallback(() => {
    // Same built-in asset and HTMLAudio playback as Agent sounds, with no looping or dependency
    // on whether Agent sounds are enabled: this is an explicitly started todo timer.
    const audio = new Audio(timerSound);
    audio.volume = 0.7;
    void audio.play().catch((error: unknown) => console.error("Failed to play the todo timer sound", error));
    if (onNotice) {
      if (settings.todoEnabled && !quiet) onNotice(t.todo.timeUp, "todo");
      return;
    }
    void isIslandVisible().then((visible) => {
      if (visible && settings.todoEnabled && !quiet) openIslandPage("todo");
    }).catch((error: unknown) => console.error("Failed to check island visibility for a todo timer", error));
  }, [onNotice, openIslandPage, quiet, settings.todoEnabled, t]);

  const { todos, activeTodoId, timer, todoPageMode, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    todoTimerEnabled: settings.todoTimerEnabled,
    onStartTodo: collapseIsland,
    onTimerExpired,
    onMissingSaveDirectory: openSavePathSettings,
  });
  const previousActive = useRef(activeTodoId);
  useEffect(() => {
    const changed = previousActive.current !== activeTodoId;
    previousActive.current = activeTodoId;
    const todo = todos.find((item) => item.id === activeTodoId);
    if (changed && todo && isTucked && settings.todoEnabled && !quiet) onNotice?.(t.todo.actionOnTask(t.todo.start, todo.title), "todo");
  }, [activeTodoId, todos, isTucked, settings.todoEnabled, quiet, onNotice, t]);
  return { todos, activeTodoId, timer, todoPageMode, todoListHeight,
    notebookProps: { ...notebookProps, onListHeightChange: setTodoListHeight } };
}
