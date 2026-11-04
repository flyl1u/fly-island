import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { runTodoApiCall, TODO_API_METHODS, type TodoApiResult, type TodoApiState } from "./apiCommands";
import { createTodoId } from "./storage";
import type { ScheduledTodo, TodoItem } from "./types";

export type TodoApiHandlers = Record<string, (params: unknown) => TodoApiResult>;

/**
 * Handlers for the local API's todo and note calls, keyed by method name. They work
 * on the latest state through a ref, and update the ref straight away so calls that
 * arrive before the next render still see each other's changes.
 */
export function useTodoApiHandlers({
  date,
  todos,
  scheduledTodos,
  activeTodoId,
  dailyNote,
  setTodos,
  setDailyNote,
  scheduleTodo,
}: TodoApiState & {
  setTodos: Dispatch<SetStateAction<TodoItem[]>>;
  setDailyNote: Dispatch<SetStateAction<string>>;
  scheduleTodo: (title: string, date: string) => ScheduledTodo;
}): TodoApiHandlers {
  const state = useMemo(
    () => ({ date, todos, scheduledTodos, activeTodoId, dailyNote }),
    [activeTodoId, dailyNote, date, scheduledTodos, todos],
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  return useMemo(
    () =>
      Object.fromEntries(
        TODO_API_METHODS.map((method) => [
          method,
          (params: unknown): TodoApiResult => {
            const { result, change } = runTodoApiCall(method, params, stateRef.current, {
              id: createTodoId(),
              now: Date.now(),
            });
            if (change?.todos) {
              setTodos(change.todos);
              stateRef.current = { ...stateRef.current, todos: change.todos };
            }
            if (change?.dailyNote !== undefined) {
              setDailyNote(change.dailyNote);
              stateRef.current = { ...stateRef.current, dailyNote: change.dailyNote };
            }
            if (change?.schedule) {
              const todo = scheduleTodo(change.schedule.title, change.schedule.date);
              stateRef.current = {
                ...stateRef.current,
                scheduledTodos: [...stateRef.current.scheduledTodos, todo],
              };
              return { ok: true, data: todo };
            }
            return result;
          },
        ]),
      ),
    [scheduleTodo, setDailyNote, setTodos],
  );
}
