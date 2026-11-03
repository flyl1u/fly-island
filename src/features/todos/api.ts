import { invoke } from "@tauri-apps/api/core";

// 对应 src-tauri/src/lib.rs 的 SaveTodoMarkdownResult。
export type SaveTodoResult = {
  filePath: string;
};

export function saveTodoMarkdown(directory: string, date: string, content: string) {
  return invoke<SaveTodoResult>("save_todo_markdown", { directory, date, content });
}
