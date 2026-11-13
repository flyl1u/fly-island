import { useCallback, useState } from "react";
import { openSettingsWindow } from "../settings/api";
import { useTodos } from "../../features/todos/useTodos";
import type { IslandSettings } from "../../features/appearance/types";
import timerSound from "../../assets/sounds/thumb-piano/complete.wav";
import { isIslandVisible } from "./api";
import type { useIslandNavigation } from "./useIslandNavigation";

type IslandTodosOptions = {
  settings: IslandSettings;
  navigation: Pick<ReturnType<typeof useIslandNavigation>, "collapseIsland" | "openIslandPage">;
  quiet: boolean;
};

/** The todos. */
export function useIslandTodos({ settings, navigation, quiet }: IslandTodosOptions) {
  const { collapseIsland, openIslandPage } = navigation;
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
    void isIslandVisible().then((visible) => {
      if (visible && settings.todoEnabled && !quiet) openIslandPage("todo");
    }).catch((error: unknown) => console.error("Failed to check island visibility for a todo timer", error));
  }, [openIslandPage, quiet, settings.todoEnabled]);

  const { todos, activeTodoId, timer, todoPageMode, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    todoTimerEnabled: settings.todoTimerEnabled,
    onStartTodo: collapseIsland,
    onTimerExpired,
    onMissingSaveDirectory: openSavePathSettings,
  });
  return { todos, activeTodoId, timer, todoPageMode, todoListHeight,
    notebookProps: { ...notebookProps, onListHeightChange: setTodoListHeight } };
}
