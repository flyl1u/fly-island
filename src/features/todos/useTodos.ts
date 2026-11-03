import { useCallback, useEffect, useState } from "react";
import { loadCurrentTodoDate, loadDailyNote, saveCurrentTodoDate, saveDailyNote } from "./storage";
import type { ArchiveLayout, TodoItem, TodoPageMode } from "./types";
import { useTodoArchives } from "./useTodoArchives";
import { useTodoList } from "./useTodoList";
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
      onDraftChange: setDraftTodo,
      onAddTodo: list.addTodo,
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
