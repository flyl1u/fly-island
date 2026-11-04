import { isTauri } from "@tauri-apps/api/core";
import { applyTodosChange, migrateTodos } from "./api";
import { normalizeLocalTodoKeys } from "./normalize";
import { markTodosMigrated, readLocalTodoKeys } from "./storage";
import { setTodoStoreNotice, switchToTodoFile } from "./todoStore";

let prepared: Promise<void> | null = null;

/**
 * Runs once before the island shows any todo: hands the todo keys to Rust,
 * which moves them into todos.json (or finds that done already), and switches
 * storage.ts to that file. If Rust refuses, the todos stay in localStorage for
 * this run, exactly as in older versions, and the user is told.
 */
export function prepareTodoStore(): Promise<void> {
  prepared ??= run();
  return prepared;
}

async function run() {
  if (!isTauri()) return;
  const keys = readLocalTodoKeys();
  try {
    const snapshot = await migrateTodos(keys, normalizeLocalTodoKeys(keys));
    switchToTodoFile(snapshot.data, applyTodosChange);
    markTodosMigrated();
    if (snapshot.notice === "reimported") setTodoStoreNotice("reimported");
  } catch (error) {
    console.error("Could not move the todos to todos.json; using localStorage", error);
    setTodoStoreNotice("migrationFailed");
  }
}
