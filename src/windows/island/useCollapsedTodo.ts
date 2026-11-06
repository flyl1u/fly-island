import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import type { TodoItem } from "../../features/todos/types";
import { useTranslation } from "../../i18n";
import { useTodoRotation } from "./useIslandAutomation";
import { alignCollapsedIslandWidth, getCollapsedIslandWidth } from "./layout";
import type { CollapsedSlots } from "./types";

// Stands in for the agent icon (16px plus gap) when sizing the island for a session title.
const AGENT_ICON_TEXT = "MM";

/**
 * What the collapsed island shows for todos: the active (or rotating) todo
 * title, otherwise the pending count, and the width that text needs. A running
 * agent's session title (`agentTitle`) takes the place of both when given.
 * Filled plugin slots widen the island by the width they declare; the centre slot only while
 * it shows (no summary text, message preview or translation, `isPeeking`).
 */
export function useCollapsedTodo(
  todos: TodoItem[],
  activeTodoId: string | null,
  settings: IslandSettings,
  isRotationPaused: boolean,
  agentTitle: string | null = null,
  slots: CollapsedSlots = {},
  isPeeking = false,
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
  // "0 todos left" is not worth a hint; with nothing pending the bar shows what it
  // would without a todo count.
  const pendingTodoCount = pendingTodoIds.length;
  const collapsedTodoCount = settings.showIdleTodoCount && !collapsedTaskTitle && pendingTodoCount > 0
    ? pendingTodoCount
    : null;
  const { center, centerWidth = 0, sideWidth = 0 } = slots;
  const collapsedIslandWidth = useMemo(() => {
    const text = settings.showCollapsedText
      ? (agentTitle !== null ? AGENT_ICON_TEXT + agentTitle : null) ??
        collapsedTaskTitle ?? (collapsedTodoCount !== null
        ? t.island.pendingTodos(collapsedTodoCount)
        : settings.showTitle ? "fly-island" : "")
      : "";
    // The same condition as the centre slot on the collapsed bar.
    const extraWidth = sideWidth + (text === "" && center && !isPeeking ? centerWidth : 0);
    return alignCollapsedIslandWidth(
      getCollapsedIslandWidth(text, extraWidth),
      window.innerWidth,
      window.devicePixelRatio,
    );
  }, [agentTitle, center, centerWidth, collapsedTaskTitle, collapsedTodoCount, isPeeking, settings.showCollapsedText, settings.showTitle, sideWidth, t]);

  return { collapsedTaskTitle, collapsedTodoCount, collapsedIslandWidth };
}
