import { isUpdateTodo } from "../../features/todos/updateTodo";
import { useMemo } from "react";
import type { CollapsedItem, IslandSettings } from "../../features/appearance/types";
import type { TodoItem } from "../../features/todos/types";
import { useTranslation } from "../../i18n";
import { useTodoRotation } from "./useIslandAutomation";
import { alignCollapsedIslandWidth, getCollapsedIslandWidth } from "./layout";

// Stands in for the agent icon (16px plus gap) when sizing the island for a session title.
const AGENT_ICON_TEXT = "MM";
// Lyric lines come and go every few seconds; the island keeps its widest size for them rather
// than resizing with each line.
const LYRICS_WIDTH_TEXT = "♪".repeat(24);
// The song's cover (22px) and the gap after it.
const COVER_WIDTH = 30;

/** The first of `order` that has something to show, or null when none has. */
export function pickCollapsedItem(order: readonly CollapsedItem[], has: Record<CollapsedItem, boolean>): CollapsedItem | null {
  return order.find((item) => has[item]) ?? null;
}

/**
 * What the collapsed island shows: a running agent's session title (`agentTitle`), the lyric
 * line while a song plays (`lyricsPlaying`), or for todos the active (or rotating) todo title,
 * otherwise the pending count; whichever comes first in Settings → Appearance → Collapsed island
 * of those that have something to show (`collapsedItem`). Also the width that needs, with room
 * for the song's cover when `coverShown`.
 */
export function useCollapsedTodo(
  todos: TodoItem[],
  activeTodoId: string | null,
  settings: IslandSettings,
  isRotationPaused: boolean,
  agentTitle: string | null = null,
  { lyricsPlaying = false, coverShown = false }: { lyricsPlaying?: boolean; coverShown?: boolean } = {},
) {
  const t = useTranslation();
  const pendingTodoIds = useMemo(
    () => todos.filter((todo) => !todo.completed && !isUpdateTodo(todo)).map((todo) => todo.id),
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
  const collapsedItem = pickCollapsedItem(settings.collapsedPriority, {
    agent: agentTitle !== null,
    lyrics: lyricsPlaying,
    todo: collapsedTaskTitle !== null || collapsedTodoCount !== null,
  });
  const collapsedIslandWidth = useMemo(() => {
    const todoText = collapsedTaskTitle ?? (collapsedTodoCount !== null ? t.island.pendingTodos(collapsedTodoCount) : null);
    const itemText = collapsedItem === "agent"
      ? AGENT_ICON_TEXT + agentTitle
      : collapsedItem === "lyrics" ? LYRICS_WIDTH_TEXT : collapsedItem === "todo" ? todoText : null;
    const text = settings.showCollapsedText ? itemText ?? (settings.showTitle ? "fly-island" : "") : "";
    return alignCollapsedIslandWidth(
      getCollapsedIslandWidth(text, coverShown ? COVER_WIDTH : 0),
      window.innerWidth,
      window.devicePixelRatio,
    );
  }, [agentTitle, collapsedItem, collapsedTaskTitle, collapsedTodoCount, coverShown, settings.showCollapsedText, settings.showTitle, t]);

  return { collapsedTaskTitle, collapsedTodoCount, collapsedItem, collapsedIslandWidth };
}
