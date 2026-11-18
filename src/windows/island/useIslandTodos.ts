import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TodoItem } from "../../features/todos/types";
import { openSettingsWindow } from "../settings/api";
import { useTodos } from "../../features/todos/useTodos";
import type { IslandSettings } from "../../features/appearance/types";
import timerSound from "../../assets/sounds/thumb-piano/complete.wav";
import reminderSound from "../../assets/sounds/thumb-piano/idle.wav";
import type { TodoTimer } from "../../features/todos/timer";
import type { TodoReminder } from "../../features/todos/TodoReminderPopup";
import { isIslandVisible } from "./api";
import type { useIslandNavigation } from "./useIslandNavigation";

type IslandTodosOptions = {
  settings: IslandSettings;
  navigation: Pick<ReturnType<typeof useIslandNavigation>, "collapseIsland" | "openIslandPage" | "mode" | "isTucked" | "revealForMessage">;
  quiet: boolean;
};

/** How long a todo reminder stays on the collapsed island. */
const TODO_REMINDER_MS = 6000;

function playSound(source: string, label: string) {
  const audio = new Audio(source);
  audio.volume = 0.7;
  void audio.play().catch((error: unknown) => console.error(`Failed to play the ${label} sound`, error));
}

/** The todos. */
export function useIslandTodos({ settings, navigation, quiet }: IslandTodosOptions) {
  const { collapseIsland, openIslandPage, mode, isTucked, revealForMessage } = navigation;
  const [todoListHeight, setTodoListHeight] = useState<number | null>(null);
  const openSavePathSettings = useCallback(() => {
    openSettingsWindow("savePath");
  }, []);

  const onTimerExpired = useCallback(() => {
    // Same built-in asset and HTMLAudio playback as Agent sounds, with no looping or dependency
    // on whether Agent sounds are enabled: this is an explicitly started todo timer.
    playSound(timerSound, "todo timer");
    void isIslandVisible().then((visible) => {
      if (visible && settings.todoEnabled && !quiet) openIslandPage("todo");
    }).catch((error: unknown) => console.error("Failed to check island visibility for a todo timer", error));
  }, [openIslandPage, quiet, settings.todoEnabled]);

  // A round reaching its reminder before the end: a line on the collapsed island (not in game
  // mode), and a sound only when asked for (Settings → Todos).
  const [todoReminder, setTodoReminder] = useState<TodoReminder | null>(null);
  // The reminder names its todo; read from here so the timer callback need not change with the list.
  const todosRef = useRef<TodoItem[]>([]);
  const reminderOn = settings.todoEnabled && settings.todoTimerEnabled && settings.todoTimerReminder;
  const latest = useRef({ reminderOn, quiet, mode, isTucked, revealForMessage });
  useLayoutEffect(() => { latest.current = { reminderOn, quiet, mode, isTucked, revealForMessage }; });
  const onTimerReminder = useCallback((round: TodoTimer) => {
    if (!latest.current.reminderOn || latest.current.quiet) return;
    if (settings.todoTimerReminderSound) playSound(reminderSound, "todo reminder");
    if (latest.current.mode !== "collapsed") return;
    void isIslandVisible().then((visible) => {
      const current = latest.current;
      const todo = todosRef.current.find((item) => item.id === round.todoId && !item.completed);
      if (!visible || !current.reminderOn || current.quiet || current.mode !== "collapsed" || !todo || Date.now() >= round.endsAt) return;
      if (current.isTucked) current.revealForMessage();
      setTodoReminder({ todoId: round.todoId, endsAt: round.endsAt, title: todo.title,
        minutes: Math.max(1, Math.ceil((round.endsAt - Date.now()) / 60_000)), at: Date.now() });
    }).catch((error: unknown) => console.error("Failed to check island visibility for a todo reminder", error));
  }, [settings.todoTimerReminderSound]);
  useEffect(() => {
    if (!reminderOn || quiet || mode !== "collapsed") setTodoReminder(null);
  }, [mode, quiet, reminderOn]);
  useEffect(() => {
    if (!todoReminder) return;
    const timer = window.setTimeout(() => setTodoReminder(null), TODO_REMINDER_MS);
    return () => window.clearTimeout(timer);
  }, [todoReminder]);

  const { todos, activeTodoId, activeTodoIds, timer, timers, todoPageMode, notebookProps } = useTodos({
    carryOverIncompleteTodos: settings.carryOverIncompleteTodos,
    todoTimerEnabled: settings.todoTimerEnabled,
    rotateTodos: settings.rotateTodos,
    onStartTodo: collapseIsland,
    onTimerExpired,
    timerReminder: reminderOn,
    onTimerReminder,
    onMissingSaveDirectory: openSavePathSettings,
  });
  useLayoutEffect(() => {
    todosRef.current = todos;
  }, [todos]);
  const shownReminder = reminderOn && !quiet && mode === "collapsed" && timers.some((round) => round.todoId === todoReminder?.todoId
    && round.endsAt === todoReminder.endsAt && !round.notified) ? todoReminder : null;
  return { todos, activeTodoId, activeTodoIds, timer, timers, todoPageMode, todoListHeight, todoReminder: shownReminder,
    notebookProps: { ...notebookProps, onListHeightChange: setTodoListHeight } };
}
