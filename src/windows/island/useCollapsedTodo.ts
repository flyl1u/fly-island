import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import type { TodoItem } from "../../features/todos/types";
import { useTranslation } from "../../i18n";
import { useTodoRotation } from "./useIslandAutomation";
import { alignCollapsedIslandWidth, getCollapsedIslandWidth } from "./layout";

// Stands in for the agent icon (16px plus gap) when sizing the island for a session title.
const AGENT_ICON_TEXT = "MM";

/**
 * What the collapsed island shows for todos: the active (or rotating) todo
 * title, otherwise the pending count, and the width that text needs. A running
 * agent's session title (`agentTitle`) takes the place of both when given.
 */
export function useCollapsedTodo(
  todos: TodoItem[],
  activeTodoId: string | null,
  settings: IslandSettings,
  isRotationPaused: boolean,
  agentTitle: string | null = null,
) {
  const t = useTranslation();
  const pendingTodoIds = useMemo(
    () => todos.filter((todo) => !todo.completed).map((todo) => todo.id),
    [todos],
  );
  const displayedTodoId = useTodoRotation(
    pendingTodoIds,
    activeTodoId,
    settings.rotateTodos,
    settings.todoRotationSeconds,
    isRotationPaused,
  );
  const collapsedTaskTitle = useMemo(() => {
    const activeTodo = todos.find(
      (todo) => todo.id === displayedTodoId && !todo.completed,
    );
    return activeTodo?.title ?? null;
  }, [displayedTodoId, todos]);
  const collapsedTodoCount = settings.showIdleTodoCount && !collapsedTaskTitle
    ? todos.filter((todo) => !todo.completed).length
    : null;
  const collapsedIslandWidth = useMemo(
    () =>
      alignCollapsedIslandWidth(
        getCollapsedIslandWidth(
          settings.showCollapsedText
            ? (agentTitle !== null ? AGENT_ICON_TEXT + agentTitle : null) ??
              collapsedTaskTitle ?? (collapsedTodoCount !== null
              ? t.island.pendingTodos(collapsedTodoCount)
              : settings.showTitle ? "fly-island" : "")
            : "",
        ),
        window.innerWidth,
        window.devicePixelRatio,
      ),
    [agentTitle, collapsedTaskTitle, collapsedTodoCount, settings.showCollapsedText, settings.showTitle, t],
  );

  return { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth };
}
