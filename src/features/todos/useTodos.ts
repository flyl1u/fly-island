import { useCallback, useEffect, useState } from "react";
import { createTodoId, loadCurrentTodoDate, loadDailyNote, saveCurrentTodoDate, saveDailyNote } from "./storage";
import type { TodoItem, TodoPageMode } from "./types";
import { useTodoArchives } from "./useTodoArchives";
import { useTodoList } from "./useTodoList";
import { useScheduledTodos } from "./useScheduledTodos";
import { useTodoRollover } from "./useTodoRollover";
import { useTodoSaving } from "./useTodoSaving";

type TodosOptions = {
  carryOverIncompleteTodos: boolean;
  todoTimerEnabled?: boolean;
  /** Called after a todo becomes the active one shown on the collapsed island. */
  onStartTodo: () => void;
  onTimerExpired?: () => void;
  /** Called when a manual save has no directory to write to. */
  onMissingSaveDirectory: () => void;
};

/** The todo notebook: today's list and daily note, archives, markdown saving and the daily rollover. */
export function useTodos({
  carryOverIncompleteTodos,
  todoTimerEnabled = false,
  onStartTodo,
  onTimerExpired,
  onMissingSaveDirectory,
}: TodosOptions) {
  const [todoPageMode, setTodoPageMode] = useState<TodoPageMode>("today");
  const handleTimerExpired = useCallback(() => {
    setTodoPageMode("today");
    onTimerExpired?.();
  }, [onTimerExpired]);
  const list = useTodoList(onStartTodo, handleTimerExpired, todoTimerEnabled);
  const { todos, setTodos, setDraftTodo, activeTodoId, setActiveTodoId } = list;
  const [dailyNote, setDailyNote] = useState(loadDailyNote);
  const [currentTodoDate, setCurrentTodoDate] =
    useState<string>(loadCurrentTodoDate);
  const { archives, upsertArchive } = useTodoArchives();
  const { scheduledTodos, scheduleTodo, deleteScheduledTodo } =
    useScheduledTodos(currentTodoDate, setTodos);
  // Day the next added todo is for; null is the list's own day.
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const draftTodo = list.draftTodo;
  const addListTodo = list.addTodo;

  const addTodo = useCallback(() => {
    const title = draftTodo.trim();

    if (draftDate && draftDate > currentTodoDate && title) {
      scheduleTodo(title, draftDate);
      setDraftTodo("");
    } else {
      addListTodo();
    }
    setDraftDate(null);
  }, [addListTodo, currentTodoDate, draftDate, draftTodo, scheduleTodo, setDraftTodo]);
  const { saveDirectory, saveState, saveTodosToDisk, saveTodayTodos } =
    useTodoSaving({
      currentTodoDate,
      todos,
      dailyNote,
      upsertArchive,
      onMissingSaveDirectory,
    });

  const showToday = useCallback(() => {
    setTodoPageMode("today");
    setDraftTodo("");
  }, [setDraftTodo]);

  const showDaily = useCallback(() => {
    setTodoPageMode("daily");
    setDraftTodo("");
  }, [setDraftTodo]);

  const showUpcoming = useCallback(() => setTodoPageMode("upcoming"), []);
  const showCalendar = useCallback(() => setTodoPageMode("calendar"), []);

  // From the calendar: today's list gets it at the top, a later day schedules it.
  const addTodoForDay = useCallback(
    (title: string, date: string) => {
      const trimmed = title.trim();
      if (!trimmed || date < currentTodoDate) return;
      if (date > currentTodoDate) {
        scheduleTodo(trimmed, date);
        return;
      }
      setTodos((current) => [{ id: createTodoId(), title: trimmed, completed: false, createdAt: Date.now() }, ...current]);
    },
    [currentTodoDate, scheduleTodo, setTodos],
  );

  const startDay = useCallback(
    (nextDate: string, carriedTodos: TodoItem[]) => {
      setTodos(carriedTodos);
      setDailyNote("");
      setActiveTodoId((id) => list.timer && carriedTodos.some((todo) => todo.id === id) ? id : null);
      setCurrentTodoDate(nextDate);
      setTodoPageMode("today");
    },
    [list.timer, setActiveTodoId, setTodos],
  );

  useTodoRollover({
    currentTodoDate,
    todos,
    dailyNote,
    carryOverIncompleteTodos,
    timerTodoId: list.timer?.todoId,
    saveDirectory,
    saveTodosToDisk,
    upsertArchive,
    onStartDay: startDay,
  });

  useEffect(() => {
    saveDailyNote(dailyNote);
  }, [dailyNote]);

  useEffect(() => {
    saveCurrentTodoDate(currentTodoDate);
  }, [currentTodoDate]);

  return {
    todos,
    activeTodoId,
    timer: list.timer,
    todoPageMode,
    notebookProps: {
      todos,
      dailyNote,
      draft: list.draftTodo,
      activeTodoId,
      timer: list.timer,
      lastDuration: list.lastDuration,
      onDurationChange: list.chooseDuration,
      todoTimerEnabled,
      currentDate: currentTodoDate,
      pageMode: todoPageMode,
      archives,
      saveState,
      draftDate,
      scheduledTodos,
      onDraftChange: setDraftTodo,
      onDraftDateChange: setDraftDate,
      onAddTodo: addTodo,
      onShowUpcoming: showUpcoming,
      onShowCalendar: showCalendar,
      onAddTodoForDay: addTodoForDay,
      onDeleteScheduledTodo: deleteScheduledTodo,
      onToggleTodo: list.toggleTodo,
      onUpdateTodo: list.updateTodoTitle,
      onStartTodo: list.startTodo,
      onDeleteTodo: list.deleteTodo,
      onReorderTodo: list.moveTodoToIndex,
      onSaveToday: saveTodayTodos,
      onShowDaily: showDaily,
      onShowToday: showToday,
      onDailyNoteChange: setDailyNote,
    },
  };
}
