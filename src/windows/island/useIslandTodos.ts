import { useCallback } from "react";
import { openSettingsWindow } from "../settings/api";
import { useTodos } from "../../features/todos/useTodos";
import { useLocalApiBridge } from "../../features/local-api/useLocalApiBridge";
import { useBackgroundUpdateCheck } from "../../features/updater/useBackgroundUpdateCheck";
import type { AgentStatusSnapshot } from "../../features/agent-status/api";
import type { IslandSettings } from "../../features/appearance/types";
import { usePluginHostEvents } from "./usePluginHostEvents";
import { usePluginKeybindings } from "./usePluginKeybindings";
import type { IslandMode, IslandPage } from "./types";

type IslandTodosOptions = {
  settings: IslandSettings;
  mode: IslandMode;
  page: IslandPage;
  agentStatus: AgentStatusSnapshot;
  collapseIsland: () => void;
};

/**
 * The todos and what serves them to the outside: the local API, the events plugins subscribe
 * to and plugins' keybindings; the background update check runs alongside.
 */
export function useIslandTodos({ settings, mode, page, agentStatus, collapseIsland }: IslandTodosOptions) {
  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const { todos, activeTodoId, todoPageMode, apiHandlers, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    onStartTodo: collapseIsland,
    onMissingSaveDirectory: openSavePathSettings,
  });
  useLocalApiBridge(apiHandlers);
  useBackgroundUpdateCheck();
  usePluginHostEvents({
    date: notebookProps.currentDate,
    todosVersion: [todos, notebookProps.scheduledTodos, activeTodoId],
    note: notebookProps.dailyNote,
    agentStatus,
    mode,
  });
  usePluginKeybindings({ mode, page, hasActiveTodo: activeTodoId !== null });
  return { todos, activeTodoId, todoPageMode, notebookProps };
}
