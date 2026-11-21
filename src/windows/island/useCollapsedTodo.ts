import { isUpdateTodo } from "../../features/todos/updateTodo";
import { useMemo } from "react";
import { useClockWeather, useCurrentWeather } from "../../features/weather";
import { useCollapsedStatusWidth } from "./useCollapsedStatusWidth";
import { clockWeatherWidth } from "../../features/weather";
import { COLLAPSED_PADDING } from "../../features/appearance/settingsLimits";
import type { IslandSettings } from "../../features/appearance/types";
import type { TodoItem } from "../../features/todos/types";
import { formatTodoCountdown, type TodoTimer } from "../../features/todos/timer";
import { useTranslation } from "../../i18n";
import { useTodoRotation } from "./useIslandAutomation";
import { alignCollapsedIslandWidth, getCollapsedIslandWidth } from "./layout";
import { pickCollapsedItem } from "./collapsedItem";
import { selectRotatingTodos } from "../../features/todos/todoRotation";
import type { TodoRotationDisplay } from "./CollapsedTodoContent";

// Stands in for the agent icon (16px plus gap) when sizing the island for a session title.
const AGENT_ICON_TEXT = "MM";
// Lyric lines come and go every few seconds; the island keeps its widest size for them rather
// than resizing with each line.
const LYRICS_WIDTH_TEXT = "♪".repeat(24);
// The song's cover (22px) and the gap after it.
const COVER_WIDTH = 30;
// A countdown pill beside the todo title: gap, padding and about 7px a digit (12px a CJK glyph).
function timerPillWidth(text: string, fontScale: number) {
  return 20 + fontScale * [...text].reduce((width, char) => width + (/[\u2E80-\uFFFF]/.test(char) ? 12 : 7), 0);
}

/**
 * What the collapsed island shows: a running agent's session title (`agentTitle`), the lyric
 * line while a song plays (`lyricsPlaying`), or for todos the active (or rotating) todo title,
 * otherwise the pending count; whichever comes first in Settings → Appearance → Collapsed island
 * of those that have something to show (`collapsedItem`); a todo only claims its rank once one is
 * started (pickCollapsedItem). Also the width that needs, with room
 * for the song's cover beside the lyric line when `coverWanted`.
 */
export function useCollapsedTodo(
  todos: TodoItem[],
  activeTodoId: string | null,
  settings: IslandSettings,
  isRotationPaused: boolean,
  agentTitle: string | null = null,
  { lyricsPlaying = false, coverWanted = false, timer = null, activeIds, timers }: { lyricsPlaying?: boolean; coverWanted?: boolean; timer?: TodoTimer | null; activeIds?: string[]; timers?: TodoTimer[] } = {},
) {
  const t = useTranslation();
  const clockWeather = useClockWeather();
  // Dragged off the island in Settings → Appearance, they take no room and fetch nothing.
  const clockOn = clockWeather.installed && clockWeather.settings.showClock && !settings.collapsedHidden.includes("clock");
  const weather = useCurrentWeather(clockWeather.installed && clockWeather.settings.showWeather && !settings.collapsedHidden.includes("weather"),
    clockWeather.settings.location);
  const statusMinimum = useCollapsedStatusWidth(clockOn || weather !== null, settings.islandFontPercent / 100);
  const pendingTodoIds = useMemo(
    () => todos.filter((todo) => !todo.completed && !isUpdateTodo(todo)).map((todo) => todo.id),
    [todos],
  );
  const rotationTodos = useMemo(() => selectRotatingTodos(todos, activeIds ?? (activeTodoId ? [activeTodoId] : [])), [todos, activeIds, activeTodoId]);
  const rotationIds = useMemo(() => rotationTodos.map((todo) => todo.id), [rotationTodos]);
  const rotating = settings.rotateTodos && rotationTodos.length > 0;
  const rotatingTodoId = useTodoRotation(
    rotationIds,
    activeTodoId,
    rotating,
    settings.todoRotationSeconds,
    isRotationPaused || settings.todoRotationMode === "scroll",
  );
  const displayedTodoId = rotating && settings.todoRotationMode === "scroll" ? rotationIds[0] : rotatingTodoId;
  const collapsedTimer = timers?.find((round) => round.todoId === displayedTodoId)
    ?? (timer?.todoId === displayedTodoId ? timer : null);
  const todoRotation: TodoRotationDisplay | null = rotating ? {
    ids: rotationIds,
    titles: rotationTodos.map((todo) => todo.title), mode: settings.todoRotationMode,
    timers: rotationTodos.map((todo) => timers?.find((round) => round.todoId === todo.id)
      ?? (timer?.todoId === todo.id ? timer : null)),
    selectedIndex: Math.max(0, rotationIds.indexOf(displayedTodoId ?? "")),
    speed: settings.todoScrollSpeed, paused: isRotationPaused,
  } : null;
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
  const collapsedItem = timers?.length || timer ? "todo" : pickCollapsedItem(settings.collapsedPriority, {
    agent: agentTitle !== null,
    lyrics: lyricsPlaying,
    todo: collapsedTaskTitle !== null || collapsedTodoCount !== null,
  }, activeTodoId !== null && pendingTodoIds.includes(activeTodoId));
  const baseIslandWidth = useMemo(() => {
    if (!settings.collapsedAutoWidth) return settings.collapsedWidth;
    const fontScale = settings.islandFontPercent / 100;
    // A fixed width for the whole round; ticking digits never resize the native window.
    const widestTimer = (timers ?? (timer ? [timer] : [])).reduce<string | null>((widest, round) => {
      const text = round.notified ? t.todo.timeUp : formatTodoCountdown(round.durationMinutes * 60);
      return !widest || text.length > widest.length ? text : widest;
    }, null);
    const todoText = rotating && rotationTodos.length
      ? rotationTodos.reduce((widest, todo) => getCollapsedIslandWidth(todo.title, 0, fontScale) > getCollapsedIslandWidth(widest, 0, fontScale) ? todo.title : widest, "")
      : collapsedTaskTitle ?? (collapsedTodoCount !== null ? t.island.pendingTodos(collapsedTodoCount) : null);
    const itemText = collapsedItem === "agent"
      ? AGENT_ICON_TEXT + agentTitle
      : collapsedItem === "lyrics" ? LYRICS_WIDTH_TEXT : collapsedItem === "todo" ? todoText : null;
    const text = settings.showCollapsedText ? itemText ?? (settings.showTitle ? "fly-island" : "") : "";
    // The automatic widths were set with 18px each side: more side space adds to the width, less
    // keeps it and gives the text the room.
    const sides = 2 * (settings.collapsedPadding - COLLAPSED_PADDING.default);
    return alignCollapsedIslandWidth(
      getCollapsedIslandWidth(text, sides + (coverWanted && collapsedItem === "lyrics" ? COVER_WIDTH
        : widestTimer && collapsedItem === "todo" && settings.showCollapsedText ? timerPillWidth(widestTimer, fontScale) : 0), fontScale),
      window.innerWidth,
      window.devicePixelRatio,
    );
  }, [agentTitle, collapsedItem, collapsedTaskTitle, collapsedTodoCount, coverWanted, settings.collapsedAutoWidth,
    settings.collapsedPadding, settings.collapsedWidth, settings.islandFontPercent, settings.showCollapsedText, settings.showTitle, t, timer, timers, rotating, rotationTodos]);

  const collapsedIslandWidth = clockWeatherWidth(baseIslandWidth, clockOn, weather !== null, settings.islandFontPercent / 100, statusMinimum);
  return { collapsedTaskTitle, collapsedTodoCount, collapsedItem, collapsedIslandWidth, todoRotation, collapsedTimer };
}
