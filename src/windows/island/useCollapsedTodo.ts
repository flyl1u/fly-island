import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import type { TodoItem } from "../../features/todos/types";
import { useTranslation } from "../../i18n";
import { useTodoRotation } from "./useIslandAutomation";
import { getCollapsedIslandWidth } from "./layout";

/**
 * What the collapsed island shows for todos: the active (or rotating) todo
 * title, otherwise the pending count, and the width that text needs.
 */
export function useCollapsedTodo(
  todos: TodoItem[],
  activeTodoId: string | null,
  settings: IslandSettings,
  isRotationPaused: boolean,
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
      getCollapsedIslandWidth(
        settings.showCollapsedText
          ? collapsedTaskTitle ?? (collapsedTodoCount !== null
            ? t.island.pendingTodos(collapsedTodoCount)
            : settings.showTitle ? "fly-island" : "")
          : "",
      ),
    [collapsedTaskTitle, collapsedTodoCount, settings.showCollapsedText, settings.showTitle, t],
  );

  return { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth };
}
