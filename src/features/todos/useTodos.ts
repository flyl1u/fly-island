import { useCallback, useEffect, useState } from "react";
import { createTodoId, loadCurrentTodoDate, loadDailyNote, saveCurrentTodoDate, saveDailyNote } from "./storage";
import type { ArchiveLayout, TodoItem, TodoPageMode } from "./types";
import { useTodoArchives } from "./useTodoArchives";
import { useTodoList } from "./useTodoList";
import { useScheduledTodos } from "./useScheduledTodos";
import { useTodoRollover } from "./useTodoRollover";
import { useTodoSaving } from "./useTodoSaving";

type TodosOptions = {
  carryOverIncompleteTodos: boolean;
  /** Called after a todo becomes the active one shown on the collapsed island. */
  onStartTodo: () => void;
  /** Called when a manual save has no directory to write to. */
  onMissingSaveDirectory: () => void;
};

/** The todo notebook: today's list and daily note, archives, markdown saving and the daily rollover. */
export function useTodos({
  carryOverIncompleteTodos,
  onStartTodo,
  onMissingSaveDirectory,
}: TodosOptions) {
  const list = useTodoList(onStartTodo);
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
  const [todoPageMode, setTodoPageMode] = useState<TodoPageMode>("today");
  const [archiveLayout, setArchiveLayout] = useState<ArchiveLayout>("cards");
  const [selectedArchiveDate, setSelectedArchiveDate] = useState<string | null>(
    null,
  );
  const selectedArchive =
    archives.find((archive) => archive.date === selectedArchiveDate) ?? null;
  const { saveDirectory, saveState, saveTodosToDisk, saveTodayTodos } =
    useTodoSaving({
      currentTodoDate,
      todos,
      dailyNote,
      upsertArchive,
      onMissingSaveDirectory,
    });

  const showArchive = useCallback(() => {
    setTodoPageMode("archive");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, [setDraftTodo]);

  const showToday = useCallback(() => {
    setTodoPageMode("today");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, [setDraftTodo]);

  const showDaily = useCallback(() => {
    setTodoPageMode("daily");
    setSelectedArchiveDate(null);
    setDraftTodo("");
  }, [setDraftTodo]);

  const showUpcoming = useCallback(() => {
    setTodoPageMode("upcoming");
    setSelectedArchiveDate(null);
  }, []);

  const showHistory = useCallback(() => setTodoPageMode("history"), []);
  const showCalendar = useCallback(() => setTodoPageMode("calendar"), []);

  // From the history and the calendar: today's list gets it at the top, a later day schedules it.
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

  const selectArchive = useCallback(
    (date: string) => {
      if (date === currentTodoDate) {
        showToday();
        return;
      }

      setSelectedArchiveDate(date);
      setTodoPageMode("review");
      setDraftTodo("");
    },
    [currentTodoDate, setDraftTodo, showToday],
  );

  const startDay = useCallback(
    (nextDate: string, carriedTodos: TodoItem[]) => {
      setTodos(carriedTodos);
      setDailyNote("");
      setActiveTodoId(null);
      setCurrentTodoDate(nextDate);
      setTodoPageMode("today");
      setSelectedArchiveDate(null);
    },
    [setActiveTodoId, setTodos],
  );

  useTodoRollover({
    currentTodoDate,
    todos,
    dailyNote,
    carryOverIncompleteTodos,
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
    todoPageMode,
    notebookProps: {
      todos,
      dailyNote,
      draft: list.draftTodo,
      activeTodoId,
      currentDate: currentTodoDate,
      pageMode: todoPageMode,
      archives,
      archiveLayout,
      selectedArchive,
      saveState,
      draftDate,
      scheduledTodos,
      onDraftChange: setDraftTodo,
      onDraftDateChange: setDraftDate,
      onAddTodo: addTodo,
      onShowUpcoming: showUpcoming,
      onShowHistory: showHistory,
      onShowCalendar: showCalendar,
      onAddTodoForDay: addTodoForDay,
      onDeleteScheduledTodo: deleteScheduledTodo,
      onToggleTodo: list.toggleTodo,
      onUpdateTodo: list.updateTodoTitle,
      onStartTodo: list.startTodo,
      onDeleteTodo: list.deleteTodo,
      onReorderTodo: list.reorderTodo,
      onSaveToday: saveTodayTodos,
      onShowArchive: showArchive,
      onShowDaily: showDaily,
      onShowToday: showToday,
      onDailyNoteChange: setDailyNote,
      onArchiveLayoutChange: setArchiveLayout,
      onSelectArchive: selectArchive,
    },
  };
}
