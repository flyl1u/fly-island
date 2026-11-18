import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { openSettingsWindow } from "../settings/api";
import { useTodos } from "../../features/todos/useTodos";
import type { IslandSettings } from "../../features/appearance/types";
import timerSound from "../../assets/sounds/thumb-piano/complete.wav";
import reminderSound from "../../assets/sounds/thumb-piano/idle.wav";
import { isIslandVisible } from "./api";
import type { useIslandNavigation } from "./useIslandNavigation";

type IslandTodosOptions = {
  settings: IslandSettings;
  navigation: Pick<ReturnType<typeof useIslandNavigation>, "collapseIsland" | "openIslandPage">;
  quiet: boolean;
};

/** The reminder before a round ends rings three times, this far apart (idle.wav is short). */
const REMINDER_CHIMES = 3;
const REMINDER_CHIME_GAP_MS = 650;

function playSound(source: string, label: string) {
  const audio = new Audio(source);
  audio.volume = 0.7;
  void audio.play().catch((error: unknown) => console.error(`Failed to play the ${label} sound`, error));
}

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
    playSound(timerSound, "todo timer");
    void isIslandVisible().then((visible) => {
      if (visible && settings.todoEnabled && !quiet) openIslandPage("todo");
    }).catch((error: unknown) => console.error("Failed to check island visibility for a todo timer", error));
  }, [openIslandPage, quiet, settings.todoEnabled]);

  // A round reaching its reminder before the end: the todo's text flashes and its time turns red
  // (TodoListItem, the collapsed bar); with the sound asked for (Settings → Todos), three chimes.
  // Nothing in game mode.
  const reminderOn = settings.todoEnabled && settings.todoTimerEnabled && settings.todoTimerReminder;
  const latest = useRef({ reminderOn, quiet });
  useLayoutEffect(() => { latest.current = { reminderOn, quiet }; });
  const onTimerReminder = useCallback(() => {
    if (!latest.current.reminderOn || latest.current.quiet || !settings.todoTimerReminderSound) return;
    for (let chime = 0; chime < REMINDER_CHIMES; chime += 1) {
      window.setTimeout(() => playSound(reminderSound, "todo reminder"), chime * REMINDER_CHIME_GAP_MS);
    }
  }, [settings.todoTimerReminderSound]);

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
  return { todos, activeTodoId, activeTodoIds, timer, timers, todoPageMode, todoListHeight,
    notebookProps: { ...notebookProps, onListHeightChange: setTodoListHeight } };
}
