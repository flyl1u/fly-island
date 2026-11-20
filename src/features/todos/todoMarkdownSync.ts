import type { ConditionalTodoSaveResult, TodoMarkdownSnapshot } from "./api";
import { formatTodoDocumentAsMarkdown } from "./markdown.ts";
import { matchMarkdownTodos, mergeDailyMarkdown, mergeTodoDocuments, type DailyTodoDocument } from "./mergeDailyMarkdown.ts";
import { parseDailyMarkdown } from "./parseDailyMarkdown.ts";

export type TodoSyncLocal = { document: DailyTodoDocument; editedAt: number };
type SyncPorts = {
  baseline: DailyTodoDocument;
  read: () => Promise<TodoMarkdownSnapshot>;
  write: (content: string, version: string | null, recovery: string | null) => Promise<ConditionalTodoSaveResult>;
  getLocal: () => TodoSyncLocal;
  isEditing: () => boolean;
  apply: (document: DailyTodoDocument) => void;
  onSaved: (document: DailyTodoDocument, filePath: string) => void;
  createId: () => string;
  now: () => number;
};

const format = (document: DailyTodoDocument) => formatTodoDocumentAsMarkdown(document.todos, document.dailyNote);
export type TodoSyncResult = { filePath: string; deferred?: boolean; blocked?: boolean };

/** One serialized reader/writer per day+directory. Polling itself never changes React state. */
export function createTodoMarkdownSync(ports: SyncPorts) {
  let base = ports.baseline;
  let knownVersion: string | null | undefined;
  let lastWrittenContent: string | null = null;
  let candidate: { version: string | null; since: number } | null = null;
  let disposed = false;
  let pendingRecovery: string | null = null;
  let pendingImport: { before: DailyTodoDocument; written: DailyTodoDocument } | null = null;
  let pollPending: Promise<TodoSyncResult> | null = null;
  let queue = Promise.resolve<TodoSyncResult>({ filePath: "", deferred: true });

  async function synchronize(explicitSave: boolean): Promise<TodoSyncResult> {
    if (disposed) return { filePath: "", deferred: true };
    const snapshot = await ports.read();
    const deferred = { filePath: snapshot.filePath, deferred: true };
    if (disposed || ports.isEditing()) return deferred;
    if (pendingImport) {
      const latest = ports.getLocal();
      const rebased = mergeTodoDocuments(pendingImport.before, latest.document, pendingImport.written, true);
      if (rebased.conflicted) pendingRecovery = format(latest.document);
      if (format(rebased.document) !== format(latest.document)) ports.apply(rebased.document);
      pendingImport = null;
    }

    const originalLocal = ports.getLocal();
    let local = originalLocal;
    let recovery: string | null = pendingRecovery;
    let incoming: DailyTodoDocument | null = null;
    const external = snapshot.version !== knownVersion;
    const selfWritten = lastWrittenContent !== null && snapshot.content === lastWrittenContent;
    if (external && snapshot.content !== null && !selfWritten) {
      // Editors often truncate then rewrite or rename. Accept two equal samples, >= 350ms apart.
      if (candidate?.version !== snapshot.version) {
        candidate = { version: snapshot.version, since: ports.now() };
        return deferred;
      }
      if (ports.now() - candidate.since < 350) return deferred;
      const parsed = parseDailyMarkdown(snapshot.content);
      // Never overwrite an empty/invalid file with a pending island autosave.
      if (!parsed) return { ...deferred, blocked: true };
      const mergeOptions = { createId: ports.createId, now: ports.now(), preferLocal: local.editedAt > (snapshot.modifiedAt ?? 0) };
      const merged = mergeDailyMarkdown(base, local.document, parsed, mergeOptions);
      incoming = merged.remote;
      if (merged.conflicted) recovery = format(local.document);
      local = { ...local, document: merged.document };
    } else if (external && knownVersion !== undefined && snapshot.version === null) {
      // A removed file can be the first half of an editor's atomic replacement.
      return { ...deferred, blocked: true };
    }

    const reference = incoming ?? base;
    const dirty = format(local.document) !== format(reference);
    const shouldWrite = recovery !== null || (dirty && (explicitSave || ports.now() - local.editedAt >= 700))
      || (snapshot.version === null && Boolean(format(local.document)));
    if (shouldWrite) {
      if (disposed || ports.isEditing()) return deferred;
      const written = await ports.write(format(local.document), snapshot.version, recovery);
      if (disposed) return deferred;
      // Compare failed: leave local and baseline untouched and sample the newer file next time.
      if (!written.saved) { candidate = null; return deferred; }
      knownVersion = written.snapshot.version;
      // Last-write timestamps may advance when the Windows handle closes after its response.
      lastWrittenContent = format(local.document);
      base = local.document;
      candidate = null;
      pendingRecovery = null;
      // An island edit may have committed while IPC was in flight. Rebase it on this result.
      const latest = ports.getLocal();
      if (ports.isEditing()) {
        // A draft can open while native I/O is running; do not unmount its row.
        pendingImport = { before: originalLocal.document, written: local.document };
        ports.onSaved(local.document, snapshot.filePath);
        return deferred;
      }
      const rebased = mergeTodoDocuments(originalLocal.document, latest.document, local.document, true);
      if (rebased.conflicted) pendingRecovery = format(latest.document);
      if (format(rebased.document) !== format(latest.document)) ports.apply(rebased.document);
      ports.onSaved(local.document, snapshot.filePath);
      return { filePath: snapshot.filePath, ...(incoming || format(latest.document) !== format(originalLocal.document) ? { deferred: true } : {}) };
    }

    knownVersion = snapshot.version;
    if (incoming) {
      base = incoming;
      candidate = null;
      if (format(local.document) !== format(ports.getLocal().document)) ports.apply(local.document);
      if (!dirty) ports.onSaved(local.document, snapshot.filePath);
    }
    return dirty || incoming ? deferred : { filePath: snapshot.filePath };
  }

  function enqueue(explicitSave: boolean) {
    const result = queue.catch(() => ({ filePath: "", deferred: true })).then(() => synchronize(explicitSave));
    queue = result;
    return result;
  }
  const poll = () => {
    if (pollPending) return pollPending;
    const result = enqueue(false);
    pollPending = result;
    void result.finally(() => { if (pollPending === result) pollPending = null; }).catch(() => {});
    return result;
  };
  return { poll, save: () => enqueue(true), dispose: () => { disposed = true; } };
}

/** Reconstruct the last common content after restart without adding a persistence format. */
export function baselineFromSignature(date: string, signature: string | null, current: DailyTodoDocument): DailyTodoDocument {
  if (!signature) return current;
  try {
    const value: unknown = JSON.parse(signature);
    if (!value || typeof value !== "object" || !("date" in value) || value.date !== date || !("todos" in value) || !Array.isArray(value.todos)
      || !("dailyNote" in value) || typeof value.dailyNote !== "string") return current;
    const rows = value.todos.filter((row): row is { title: string; completed: boolean } => Boolean(row) && typeof row === "object"
      && "title" in row && typeof row.title === "string" && "completed" in row && typeof row.completed === "boolean");
    if (rows.length !== value.todos.length) return current;
    let index = 0;
    return { todos: matchMarkdownTodos(current.todos.filter((todo) => todo.kind !== "update"), rows, { createId: () => `baseline-${index++}`, now: 0 }), dailyNote: value.dailyNote };
  } catch { return current; }
}
