import { useCallback, useEffect, useRef } from "react";
import { readTodoMarkdown, saveTodoMarkdownIfUnchanged } from "./api";
import { getTodoSignature } from "./markdown";
import { createTodoId, loadLastSavedSignature, saveLastSavedSignature } from "./storage";
import { baselineFromSignature, createTodoMarkdownSync, type TodoSyncLocal } from "./todoMarkdownSync";
import type { DailyTodoDocument } from "./mergeDailyMarkdown";
import { useTodoFileSyncSetting } from "./useTodoFileSyncSetting";

type FileSyncOptions = DailyTodoDocument & {
  date: string;
  directory: string;
  onImport: (document: DailyTodoDocument) => void;
  onSaved: (document: DailyTodoDocument, path: string) => void;
};

/** Editing is kept local to the notebook; sampling the focused editor also protects note typing. */
function notebookIsEditing() {
  return Boolean(document.querySelector(".todo-title-input, .todo-item--dragging"))
    || Boolean(document.activeElement?.matches(".daily-note, .todo-form input"));
}

export function useTodoFileSync(options: FileSyncOptions) {
  const { enabled } = useTodoFileSyncSetting();
  const latest = useRef(options);
  const local = useRef<TodoSyncLocal>({ document: options, editedAt: 0 });
  const signature = useRef(getTodoSignature(options.date, options.todos, options.dailyNote));
  const controller = useRef<ReturnType<typeof createTodoMarkdownSync> | null>(null);
  const { date, directory } = options;

  useEffect(() => {
    latest.current = options;
    const nextSignature = getTodoSignature(options.date, options.todos, options.dailyNote);
    if (nextSignature !== signature.current) {
      local.current = { document: options, editedAt: Date.now() };
      signature.current = nextSignature;
    } else local.current = { ...local.current, document: options };
  }, [options]);

  useEffect(() => {
    if (!enabled || !directory.trim()) return;
    const sync = createTodoMarkdownSync({
      baseline: baselineFromSignature(date, loadLastSavedSignature(), local.current.document),
      read: () => readTodoMarkdown(directory, date),
      write: (content, version, recovery) => saveTodoMarkdownIfUnchanged(directory, date, content, version, recovery),
      getLocal: () => local.current,
      isEditing: notebookIsEditing,
      apply: (document) => {
        local.current = { ...local.current, document };
        signature.current = getTodoSignature(date, document.todos, document.dailyNote);
        latest.current.onImport(document);
      },
      onSaved: (document, path) => {
        saveLastSavedSignature(getTodoSignature(date, document.todos, document.dailyNote));
        latest.current.onSaved(document, path);
      },
      now: Date.now,
      createId: createTodoId,
    });
    controller.current = sync;
    const poll = () => void sync.poll().catch((error) => console.error("Failed to sync todo Markdown", error));
    poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      window.clearInterval(timer);
      sync.dispose();
      if (controller.current === sync) controller.current = null;
    };
  }, [date, directory, enabled]);

  const save = useCallback(async () => controller.current?.save() ?? { filePath: "", deferred: true }, []);
  return { enabled, save };
}
