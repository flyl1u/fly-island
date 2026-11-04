import type { AppliedTodosChange, TodosChange, TodosData } from "./api";

/**
 * Where this window keeps the todos: in todos.json through Rust ("file"), or in
 * localStorage as older versions did ("local": outside Tauri, or when the
 * migration failed). storage.ts reads and writes through this.
 *
 * In file mode the data read at start-up is kept here, and saves are queued:
 * one write at a time, later changes merged into the next write, and a failed
 * write retried, so a burst of typing does not become a burst of disk writes.
 */

type Writer = (change: TodosChange) => Promise<AppliedTodosChange>;
export type TodoStoreNotice = "migrationFailed" | "reimported";

const RETRY_MS = 2000;

let data: TodosData | null = null;
let writer: Writer | null = null;
let pending: TodosChange = {};
let hasPending = false;
let writing = false;
let notice: TodoStoreNotice | null = null;

/** Switches to todos.json with the data it holds now. */
export function switchToTodoFile(initial: TodosData, write: Writer) {
  data = { ...initial };
  writer = write;
}

/** The data from todos.json, or null while the todos are in localStorage. */
export function todoFileData(): Readonly<TodosData> | null {
  return data;
}

export function setTodoStoreNotice(next: TodoStoreNotice) {
  notice = next;
}

/** The start-up notice for the user, once. */
export function takeTodoStoreNotice() {
  const current = notice;
  notice = null;
  return current;
}

/** Saves the fields of `change` that differ from what todos.json holds. */
export function queueTodoChange(change: TodosChange) {
  if (!data) return;
  let changed = false;
  for (const key of Object.keys(change) as (keyof TodosData)[]) {
    const value = change[key];
    if (value === undefined || JSON.stringify(value) === JSON.stringify(data[key])) continue;
    data = { ...data, [key]: value };
    pending = { ...pending, [key]: value };
    changed = true;
  }
  if (!changed) return;
  hasPending = true;
  void flush();
}

async function flush() {
  if (writing || !hasPending || !writer) return;
  writing = true;
  const change = pending;
  pending = {};
  hasPending = false;
  try {
    await writer(change);
  } catch (error) {
    console.error("Failed to save the todos; trying again", error);
    // Newer values queued meanwhile win over the ones that failed.
    pending = { ...change, ...pending };
    hasPending = true;
    writing = false;
    window.setTimeout(() => void flush(), RETRY_MS);
    return;
  }
  writing = false;
  if (hasPending) void flush();
}
