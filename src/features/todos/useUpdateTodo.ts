import { useEffect, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "../../i18n";
import { getUpdateState, subscribeToUpdate } from "../updater/updaterController";
import { syncUpdateTodo } from "./updateTodo";
import type { TodoItem } from "./types";

export function useUpdateTodo(todos: TodoItem[], setTodos: Dispatch<SetStateAction<TodoItem[]>>) {
  // Byte progress belongs to the row action, not the whole island's todo state.
  const signal = useSyncExternalStore(subscribeToUpdate, () => {
    const { stage, dismissed } = getUpdateState();
    return `${stage}|${dismissed}`;
  });
  const [stage, dismissed] = signal.split("|");
  const title = useTranslation().settings.project.update.updateTodo;

  useEffect(() => {
    setTodos((current) => syncUpdateTodo(current, { stage, dismissed: dismissed === "true" }, title));
  }, [stage, dismissed, title, setTodos, todos]);
}
