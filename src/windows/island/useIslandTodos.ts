import { useCallback } from "react";
import { openSettingsWindow } from "../settings/api";
import { useTodos } from "../../features/todos/useTodos";
import type { IslandSettings } from "../../features/appearance/types";

type IslandTodosOptions = {
  settings: IslandSettings;
  collapseIsland: () => void;
};

/** The todos. */
export function useIslandTodos({ settings, collapseIsland }: IslandTodosOptions) {
  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const { todos, activeTodoId, todoPageMode, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    onStartTodo: collapseIsland,
    onMissingSaveDirectory: openSavePathSettings,
  });
  return { todos, activeTodoId, todoPageMode, notebookProps };
}
