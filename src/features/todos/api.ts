import { invoke } from "@tauri-apps/api/core";

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
