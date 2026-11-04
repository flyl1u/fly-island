import { invoke } from "@tauri-apps/api/core";
import type { ScheduledTodo, TodoArchive, TodoItem } from "./types";

// 对应 src-tauri/src/system/todo_export.rs 的 SaveTodoMarkdownResult。
export type SaveTodoResult = {
  filePath: string;
};

export function saveTodoMarkdown(directory: string, date: string, content: string) {
  return invoke<SaveTodoResult>("save_todo_markdown", { directory, date, content });
}

export function getDefaultTodoSaveDirectory() {
  return invoke<string>("get_default_todo_save_directory");
}

// 对应 src-tauri/src/todos/model.rs 的 TodosData：todos.json 里的待办数据。
export type TodosData = {
  date: string;
  todos: TodoItem[];
  scheduled: ScheduledTodo[];
  archives: TodoArchive[];
  dailyNote: string;
  activeTodoId: string | null;
};

// 对应 src-tauri/src/todos/migration.rs 的 LocalTodoKeys：各 localStorage key 的原文，没有时为 null。
export type LocalTodoKeys = {
  "focusd-island-todos": string | null;
  "focusd-island-archives": string | null;
  "focusd-island-scheduled-todos": string | null;
  "focusd-island-daily-note": string | null;
  "focusd-island-active-todo": string | null;
  "focusd-island-current-date": string | null;
};

// 对应 src-tauri/src/todos/migration.rs 的 TodosSnapshot。
export type TodosSnapshot = {
  revision: number;
  data: TodosData;
  /** "reimported": an older version changed the todos, and its data replaced todos.json. */
  notice: "reimported" | null;
};

// 对应 src-tauri/src/todos/service.rs 的 TodosChange：只带变了的字段。
export type TodosChange = Partial<TodosData>;

// 对应 src-tauri/src/todos/service.rs 的 AppliedTodosChange。
export type AppliedTodosChange = { revision: number };

/** Moves the todo keys into todos.json (or confirms it was done); rejects when they must stay in localStorage. */
export function migrateTodos(keys: LocalTodoKeys, normalized: TodosData) {
  return invoke<TodosSnapshot>("migrate_todos", { keys, normalized });
}

export function getTodosState() {
  return invoke<TodosSnapshot>("get_todos_state");
}

export function applyTodosChange(change: TodosChange) {
  return invoke<AppliedTodosChange>("apply_todos_change", { change });
}
