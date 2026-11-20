import { invoke } from "@tauri-apps/api/core";

// 对应 src-tauri/src/system/todo_export.rs 的 SaveTodoMarkdownResult。
export type SaveTodoResult = {
  filePath: string;
};

export function saveTodoMarkdown(directory: string, date: string, content: string) {
  return invoke<SaveTodoResult>("save_todo_markdown", { directory, date, content });
}

// 对应 src-tauri/src/system/todo_sync.rs 的 TodoMarkdownSnapshot / ConditionalTodoSaveResult。
export type TodoMarkdownSnapshot = {
  filePath: string;
  version: string | null;
  modifiedAt: number | null;
  content: string | null;
};
export type ConditionalTodoSaveResult = { saved: boolean; snapshot: TodoMarkdownSnapshot };

export function readTodoMarkdown(directory: string, date: string) {
  return invoke<TodoMarkdownSnapshot>("read_todo_markdown", { directory, date });
}

export function saveTodoMarkdownIfUnchanged(directory: string, date: string, content: string, expectedVersion: string | null, recoveryContent: string | null) {
  return invoke<ConditionalTodoSaveResult>("save_todo_markdown_if_unchanged", { directory, date, content, expectedVersion, recoveryContent });
}

export function getDefaultTodoSaveDirectory() {
  return invoke<string>("get_default_todo_save_directory");
}

/** Native folder picker over the calling window; resolves to `null` when cancelled. */
export function pickFolder(initialDirectory: string, title: string) {
  return invoke<string | null>("pick_folder", { initialDirectory, title });
}
