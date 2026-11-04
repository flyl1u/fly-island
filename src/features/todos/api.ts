import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
export type TodosChange = Partial<TodosData> & {
  /** The revision this window last saw; fields a plugin or script changed after it are not overwritten. */
  baseRevision?: number;
};

// 对应 src-tauri/src/todos/service.rs 的 AppliedTodosChange。
export type AppliedTodosChange = {
  revision: number;
  /** Fields not saved because a plugin or script changed them first; take them from `data`. */
  conflicts: (keyof TodosData)[];
  data: TodosData | null;
};

// 对应 src-tauri/src/todos/service.rs 的 CHANGED_EVENT：插件或本地接口改了 todos.json。
const TODOS_CHANGED_EVENT = "todos-changed";
export type TodosChangedPayload = {
  revision: number;
  data: TodosData;
  /** The fields that call changed; the others in `data` may be older than this window's. */
  fields: (keyof TodosData)[];
  reason: string | null;
};

/** Calls `onChange` when a plugin or the local API changed the todos; resolves to the unlisten function. */
export function listenTodosChanged(onChange: (payload: TodosChangedPayload) => void) {
  return listen<TodosChangedPayload>(TODOS_CHANGED_EVENT, (event) => onChange(event.payload));
}

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
