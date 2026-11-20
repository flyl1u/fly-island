import type { TodoItem } from "./types";
import type { MarkdownTodo, ParsedDailyMarkdown } from "./parseDailyMarkdown";
import { withoutUpdateTodo } from "./updateTodo.ts";

export type DailyTodoDocument = { todos: TodoItem[]; dailyNote: string };
export type MarkdownMergeOptions = { createId: () => string; now: number; preferLocal?: boolean };

/** Reserve exact titles first (nearest position for duplicates), then infer renames. */
export function matchMarkdownTodos(existing: TodoItem[], rows: MarkdownTodo[], options: MarkdownMergeOptions): TodoItem[] {
  const remaining = new Set(existing.map((_, index) => index));
  const matches = rows.map((row, position) => {
    const index = [...remaining].filter((index) => existing[index].title === row.title)
      .sort((a, b) => Math.abs(a - position) - Math.abs(b - position) || a - b)[0];
    if (index !== undefined) remaining.delete(index);
    return index;
  });
  const missing = matches.flatMap((match, index) => match === undefined ? [index] : []);
  // A rename between two unchanged neighbours is still identifiable when another gap grows.
  const anchors = [-1, ...matches.flatMap((match, index) => match === undefined ? [] : [index]), rows.length];
  for (let index = 1; index < anchors.length; index += 1) {
    const left = anchors[index - 1], right = anchors[index];
    const start = left < 0 ? -1 : matches[left] ?? -1;
    const end = right === rows.length ? existing.length : matches[right] ?? existing.length;
    const positions = missing.filter((position) => position > left && position < right);
    const indices = [...remaining].filter((position) => position > start && position < end);
    if (indices.length !== positions.length) continue;
    positions.forEach((position, offset) => { matches[position] = indices[offset]; remaining.delete(indices[offset]); });
  }
  const unmatched = missing.filter((position) => matches[position] === undefined);
  // Unequal unmatched counts indicate insertion/deletion; do not borrow another task's timer.
  if (remaining.size === unmatched.length) {
    const indices = [...remaining];
    unmatched.forEach((position, index) => { matches[position] = indices[index]; });
  }
  return rows.map((row, index) => {
    const matched = matches[index];
    const previous = matched === undefined ? null : existing[matched];
    return previous ? { ...previous, ...row } : { ...row, id: options.createId(), createdAt: options.now + index };
  });
}

function changed(todo: TodoItem, base: TodoItem) {
  return todo.title !== base.title || todo.completed !== base.completed;
}

/** Three-way merge: independent island edits survive a file edit; newer side wins a conflict. */
export function mergeDailyMarkdown(
  base: DailyTodoDocument,
  local: DailyTodoDocument,
  parsed: ParsedDailyMarkdown,
  options: MarkdownMergeOptions,
): { document: DailyTodoDocument; conflicted: boolean; remote: DailyTodoDocument } {
  const baseline = withoutUpdateTodo(base.todos);
  const current = withoutUpdateTodo(local.todos);
  const usedIds = new Set<string>();
  const rows = parsed.todos ? matchMarkdownTodos(baseline, parsed.todos, options) : current;
  const remote = rows.map((incoming) => {
    const existing = baseline.some((todo) => todo.id === incoming.id) ? incoming
      : current.find((todo) => !usedIds.has(todo.id) && !baseline.some((item) => item.id === todo.id) && todo.title === incoming.title);
    const todo = existing ? { ...existing, completed: incoming.completed } : incoming;
    usedIds.add(todo.id);
    return todo;
  });
  const remoteDocument = { todos: remote, dailyNote: parsed.dailyNote };
  return { ...mergeTodoDocuments(base, local, remoteDocument, options.preferLocal), remote: remoteDocument };
}

/** The same reconciliation with known IDs, used for edits committed while a save is in flight. */
export function mergeTodoDocuments(base: DailyTodoDocument, local: DailyTodoDocument, incomingDocument: DailyTodoDocument, preferLocal = false) {
  const baseline = withoutUpdateTodo(base.todos);
  const current = withoutUpdateTodo(local.todos);
  const remote = withoutUpdateTodo(incomingDocument.todos);
  const baseById = new Map(baseline.map((todo) => [todo.id, todo]));
  const localById = new Map(current.map((todo) => [todo.id, todo]));
  const remoteById = new Map(remote.map((todo) => [todo.id, todo]));
  let conflicted = false;

  const todos = remote.flatMap((incoming) => {
    const original = baseById.get(incoming.id);
    const island = localById.get(incoming.id);
    if (!original) return [island ? { ...island, completed: incoming.completed } : incoming];
    if (!island) {
      if (!changed(incoming, original)) return [];
      conflicted = true;
      return preferLocal ? [] : [incoming];
    }
    const merged = { ...island };
    for (const field of ["title", "completed"] as const) {
      const localChanged = island[field] !== original[field];
      const remoteChanged = incoming[field] !== original[field];
      if (localChanged && remoteChanged && island[field] !== incoming[field]) conflicted = true;
      if (remoteChanged && (!localChanged || !preferLocal)) {
        // Assign fields explicitly to preserve their distinct TS types.
        if (field === "title") merged.title = incoming.title;
        else merged.completed = incoming.completed;
      }
    }
    return [merged];
  });

  for (const island of current) {
    if (todos.some((todo) => todo.id === island.id)) continue;
    const original = baseById.get(island.id);
    if (!original) todos.push(island);
    else if (!remoteById.has(island.id) && changed(island, original)) {
      conflicted = true;
      if (preferLocal) todos.push(island);
    }
  }
  const common = baseline.filter((todo) => localById.has(todo.id) && remoteById.has(todo.id)).map((todo) => todo.id);
  const localOrder = current.filter((todo) => common.includes(todo.id)).map((todo) => todo.id);
  const remoteOrder = remote.filter((todo) => common.includes(todo.id)).map((todo) => todo.id);
  const localReordered = common.join("\n") !== localOrder.join("\n");
  const remoteReordered = common.join("\n") !== remoteOrder.join("\n");
  if (localReordered && remoteReordered && localOrder.join("\n") !== remoteOrder.join("\n")) conflicted = true;
  if (localReordered && (!remoteReordered || preferLocal)) {
    const rank = new Map(current.map((todo, index) => [todo.id, index]));
    todos.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }

  const localNoteChanged = local.dailyNote !== base.dailyNote;
  const remoteNoteChanged = incomingDocument.dailyNote !== base.dailyNote;
  if (localNoteChanged && remoteNoteChanged && local.dailyNote !== incomingDocument.dailyNote) conflicted = true;
  const dailyNote = remoteNoteChanged && (!localNoteChanged || !preferLocal) ? incomingDocument.dailyNote : local.dailyNote;
  return { document: { todos: [...local.todos.filter((todo) => todo.kind === "update"), ...todos], dailyNote }, conflicted };
}
