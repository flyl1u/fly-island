import { act } from "react";
import { saveSaveDirectory, TODO_SAVE_DIRECTORY_STORAGE_KEY } from "../../src/features/todos/storage";

export async function checkTodoFileSync(panel: Element, check: (value: unknown, message: string) => void) {
  const row = () => [...panel.querySelectorAll(".settings-row")].find(node => node.textContent?.includes("从文件同步回岛上"))!;
  const toggle = () => row().querySelector<HTMLInputElement>("input[role=switch]")!;
  check(!toggle().checked && toggle().disabled && row().textContent?.includes("请先保存"), "todo: file sync defaults off and requires a saved path");
  await act(async () => {
    saveSaveDirectory("D:/notes");
    window.dispatchEvent(new StorageEvent("storage", { key: TODO_SAVE_DIRECTORY_STORAGE_KEY }));
  });
  check(!toggle().disabled && row().textContent?.includes("在外部编辑当天"), "todo: a saved path enables sync and explains daily Markdown edits");
  await act(async () => toggle().click());
  check(toggle().checked && localStorage.getItem("fly-island-todo-file-sync") === "true", "todo: enabling file sync persists the opt-in");
  await act(async () => toggle().click());
  await act(async () => {
    saveSaveDirectory("");
    window.dispatchEvent(new StorageEvent("storage", { key: TODO_SAVE_DIRECTORY_STORAGE_KEY }));
  });
  check(toggle().disabled && !toggle().checked, "todo: clearing the saved path disables sync again");
}
