import { isUpdateTodo } from "../../features/todos/updateTodo";
import { useMemo, useState } from "react";
import { useClockWeather, useCurrentWeather } from "../../features/weather";
import { useCollapsedStatusWidth } from "./useCollapsedStatusWidth";
import { fitClockWeather } from "../../features/weather";
import { idleTextDisplay } from "../../features/appearance/idleText";
import { COLLAPSED_PADDING } from "../../features/appearance/settingsLimits";
import type { CollapsedItem, IslandSettings } from "../../features/appearance/types";
import type { TodoItem } from "../../features/todos/types";
import { formatTodoCountdown, type TodoTimer } from "../../features/todos/timer";
import { useTranslation } from "../../i18n";
import { useTodoRotation } from "./useIslandAutomation";
import { getCollapsedTextUnits } from "../../utils/text";
import { collapsedWidthTarget, type CollapsedWidthContent } from "./collapsedWidth";
import { nextCollapsedItem, resolveCollapsedItem } from "./collapsedItem";
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
  { lyricsPlaying = false, lyricsAvailable = false, agentActive = false, coverWanted = false, timer = null, activeIds, timers, notice = null, alertText = null }: {
    lyricsPlaying?: boolean; coverWanted?: boolean; timer?: TodoTimer | null; activeIds?: string[]; timers?: TodoTimer[];
    lyricsAvailable?: boolean; agentActive?: boolean;
    notice?: CollapsedWidthContent | null; alertText?: string | null;
  } = {},
) {
  const t = useTranslation();
  const clockWeather = useClockWeather();
  // Dragged off the island in Settings → Appearance, they take no room and fetch nothing.
  const clockOn = clockWeather.installed && clockWeather.settings.showClock && !settings.collapsedHidden.includes("clock");
  const weather = useCurrentWeather(clockWeather.installed && clockWeather.settings.showWeather && !settings.collapsedHidden.includes("weather"),
    clockWeather.settings.location);
  // Only the automatic width grows with the status slots; a manual width is the whole island.
  const statusMinimum = useCollapsedStatusWidth(settings.collapsedAutoWidth, settings.islandFontPercent / 100);
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
  const available = {
    agent: agentTitle !== null,
    lyrics: lyricsPlaying,
    todo: collapsedTaskTitle !== null || collapsedTodoCount !== null,
  };
  const canSwitchTo = { ...available, agent: available.agent && agentActive, lyrics: lyricsPlaying && lyricsAvailable };
  const [choice, setChoice] = useState<CollapsedItem | null>(null);
  const selection = resolveCollapsedItem(settings.collapsedPriority, available, canSwitchTo, choice,
    activeTodoId !== null && pendingTodoIds.includes(activeTodoId), Boolean(timers?.length || timer));
  if (choice !== selection.choice) setChoice(selection.choice);
  const collapsedItem = selection.item;
  const switchCollapsedItem = () => {
    if (!settings.showCollapsedText) return;
    const next = nextCollapsedItem(settings.collapsedPriority, canSwitchTo, collapsedItem);
    if (next !== null) setChoice(next);
  };
  const idleDisplay = idleTextDisplay(settings, {
    itemShown: collapsedItem !== null,
    pendingLine: collapsedItem === "todo" && !collapsedTaskTitle && collapsedTodoCount !== null,
  });
  const fontScale = settings.islandFontPercent / 100;
  const content = useMemo(() => {
    // A fixed width for the whole round; ticking digits never resize the native window.
    const visibleTimers = rotating && timers ? timers : collapsedTimer ? [collapsedTimer] : [];
    const widestTimer = visibleTimers.reduce<string | null>((widest, round) => {
      const text = round.notified ? t.todo.timeUp : formatTodoCountdown(round.durationMinutes * 60);
      return !widest || text.length > widest.length ? text : widest;
    }, null);
    const todoText = rotating && rotationTodos.length
      ? rotationTodos.reduce((widest, todo) => getCollapsedTextUnits(todo.title) > getCollapsedTextUnits(widest) ? todo.title : widest, "")
      : collapsedTaskTitle ?? (collapsedTodoCount !== null ? idleDisplay.pending ?? t.island.pendingTodos(collapsedTodoCount) : null);
    const itemText = collapsedItem === "agent"
      ? AGENT_ICON_TEXT + agentTitle
      : collapsedItem === "lyrics" ? LYRICS_WIDTH_TEXT : collapsedItem === "todo" ? todoText : null;
    return {
      text: settings.showCollapsedText ? itemText ?? "" : "",
      brand: settings.showCollapsedText ? idleDisplay.brand : null,
      extraWidth: widestTimer && collapsedItem === "todo" && settings.showCollapsedText ? timerPillWidth(widestTimer, fontScale) : 0,
    };
  }, [agentTitle, collapsedItem, collapsedTaskTitle, collapsedTodoCount, fontScale, settings.showCollapsedText,
    idleDisplay.brand, idleDisplay.pending, t, collapsedTimer, timers, rotating, rotationTodos]);

  const statusFit = fitClockWeather(settings.collapsedAutoWidth ? settings.collapsedAutoWidthMax : settings.collapsedWidth,
    clockOn, weather !== null, fontScale);
  const coverWidth = coverWanted && collapsedItem === "lyrics" ? COVER_WIDTH : 0;
  const replacement = notice ?? (alertText === null ? null : { text: alertText, extraWidth: 22 });
  const collapsedIslandWidth = collapsedWidthTarget({
    manual: settings.collapsedWidth,
    range: settings.collapsedAutoWidth ? { min: settings.collapsedAutoWidthMin, max: settings.collapsedAutoWidthMax } : null,
    content: { ...content, extraWidth: content.extraWidth + coverWidth },
    preview: replacement && { ...replacement, extraWidth: replacement.extraWidth + coverWidth },
    fontScale, paddingExtra: 2 * (settings.collapsedPadding - COLLAPSED_PADDING.default),
    clock: statusFit.clock, weather: statusFit.weather, statusMinimum, stageWidth: window.innerWidth, devicePixelRatio: window.devicePixelRatio,
  });
  return { collapsedTaskTitle, collapsedTodoCount, collapsedItem, switchCollapsedItem, collapsedIslandWidth, statusFit, idleDisplay, todoRotation, collapsedTimer };
}
