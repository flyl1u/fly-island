import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { I18nProvider } from "../../src/i18n";
import { TodoNotebook } from "../../src/features/todos/TodoNotebook";
import { useTodos } from "../../src/features/todos/useTodos";
import { getLocalDateString } from "../../src/utils/date";
import { getTodoSignature } from "../../src/features/todos/markdown";
import { saveTodoFileSync, saveSaveDirectory } from "../../src/features/todos/storage";
import type { TodoMarkdownSnapshot } from "../../src/features/todos/api";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("fly-island-")));
const RealDate = Date;
let now = new RealDate().setHours(12, 0, 0, 0);
class FakeDate extends RealDate {
  constructor(value?: string | number) { super(value ?? now); }
  static now() { return now; }
}
Object.defineProperty(window, "Date", { configurable: true, value: FakeDate });
const realInterval = window.setInterval.bind(window);
const realClear = window.clearInterval.bind(window);
let intervalId = 900000;
const ticks = new Map<number, { period: number; run: () => void }>();
window.setInterval = ((handler: TimerHandler, period?: number, ...args: unknown[]) => {
  if ((period === 1500 || period === 30000) && typeof handler === "function") {
    const id = ++intervalId;
    ticks.set(id, { period, run: () => handler(...args) });
    return id;
  }
  return realInterval(handler, period, ...args);
}) as typeof window.setInterval;
window.clearInterval = ((id?: number) => { if (id !== undefined && ticks.delete(id)) return; realClear(id); }) as typeof window.clearInterval;
for (const key of original.keys()) localStorage.removeItem(key);
const today = getLocalDateString();
const initial = [{ id: "a", title: "Alpha", completed: false, createdAt: 7 }, { id: "b", title: "Beta", completed: false, createdAt: 8 }];
localStorage.setItem("fly-island-current-date", today);
localStorage.setItem("fly-island-todos", JSON.stringify(initial));
localStorage.setItem("fly-island-save-directory", "D:/notes");
localStorage.setItem("fly-island-last-saved-signature", getTodoSignature(today, initial, ""));
localStorage.setItem("fly-island-active-todos", '["a"]');
localStorage.setItem("fly-island-todo-timers", JSON.stringify([{ todoId: "a", endsAt: now + 3600000, durationMinutes: 60, notified: false }]));
localStorage.setItem("fly-island-scheduled-todos", JSON.stringify([{ id: "later", title: "Future", date: "2099-01-01", createdAt: 9 }]));
let version = 0;
let reads = 0;
let writes = 0;
const files = new Map<string, TodoMarkdownSnapshot>();
const paths: string[] = [];
function external(date: string, content: string) {
  files.set(date, { filePath: `D:/notes/${date}.md`, content, version: `v${++version}`, modifiedAt: now });
}
external(today, "- [ ] Alpha\n- [ ] Beta");
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "get_default_todo_save_directory") return "D:/notes";
  if (command === "read_todo_markdown" || command === "save_todo_markdown_if_unchanged" || command === "save_todo_markdown") {
    const date = String(args.date);
    paths.push(`${args.directory}/${date}`);
    const snapshot = files.get(date) ?? { filePath: `D:/notes/${date}.md`, version: null, content: null, modifiedAt: null };
    if (command === "read_todo_markdown") { reads++; return { ...snapshot }; }
    if (command === "save_todo_markdown_if_unchanged" && args.expectedVersion !== snapshot.version) return { saved: false, snapshot };
    writes++;
    external(date, String(args.content));
    return command === "save_todo_markdown" ? { filePath: snapshot.filePath } : { saved: true, snapshot: files.get(date) };
  }
  return null;
}, { shouldMockEvents: true });
mockWindows("main");
let model: ReturnType<typeof useTodos>;
function Harness() {
  model = useTodos({ carryOverIncompleteTodos: false, todoTimerEnabled: true, onStartTodo: () => {}, onMissingSaveDirectory: () => {} });
  return <TodoNotebook {...model.notebookProps} enableTodoReorder scrollStartRows={8} />;
}
const root = createRoot(document.getElementById("fixture")!);
const messages: string[] = [];
const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); messages.push(`PASS ${label}`); };
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const tick = (period = 1500) => act(async () => {
  now += period;
  for (const timer of [...ticks.values()]) if (timer.period === period) timer.run();
  await flush();
});
const stable = async () => { await tick(); await tick(); };
const click = (selector: string) => act(async () => { document.querySelector<HTMLButtonElement>(selector)!.click(); });
const editTitle = (value: string) => act(async () => {
  const field = document.querySelector<HTMLTextAreaElement>(".todo-title-input")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
});

try {
  await act(async () => root.render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>));
  await tick();
  check(reads === 0 && writes === 0, "Default off: no read command or new writer runs");
  await act(async () => saveTodoFileSync(true));
  await stable();
  const timerEnd = model!.timers[0]?.endsAt;
  external(today, "* [X] Beta\n- [ ] Alpha\n- New task\n\n## Notes\nFrom editor");
  await stable();
  check(model!.todos.map(todo => todo.title).join() === "Beta,Alpha,New task" && model!.todos[0].completed, "File order, additions and completion reach the actual todo hook");
  check(model!.todos[1].id === "a" && model!.todos[1].createdAt === 7 && model!.timers[0]?.endsAt === timerEnd,
    "Matching preserves ID, creation time and the running countdown");
  check(model!.notebookProps.dailyNote === "## Notes\nFrom editor" && model!.notebookProps.scheduledTodos[0].id === "later", "Daily note imports and future scheduled tasks stay separate");
  check(JSON.parse(localStorage.getItem("fly-island-todos")!)[0].id === "b", "Imported tasks persist in the existing localStorage format");
  const before = writes;
  await stable();
  check(writes === before, "Imported content does not loop back into another save");

  await click('[data-todo-id="a"] .todo-title--editable');
  await editTitle("My draft");
  external(today, "- [ ] Alpha\n- External addition\n\n## Notes\nFrom editor");
  await stable();
  check(document.querySelector<HTMLTextAreaElement>(".todo-title-input")?.value === "My draft" && model!.todos.length === 3, "External changes wait while a title draft is open");
  await act(async () => document.querySelector(".todo-title-input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await stable();
  check(model!.todos.some(todo => todo.title === "My draft") && model!.todos.some(todo => todo.title === "External addition"), "Committed draft merges with the pending external addition");

  external(today, "");
  await stable();
  const kept = model!.todos.length;
  await act(async () => model!.notebookProps.onToggleTodo("a"));
  await stable();
  check(model!.todos.length === kept && files.get(today)?.content === "", "An empty file neither clears local data nor gets overwritten");
  external(today, "- [ ] My draft\n- External addition");
  await stable();
  await act(async () => saveTodoFileSync(false));
  const stoppedReads = reads;
  await stable();
  check(reads === stoppedReads, "Turning sync off stops its polling");
  await act(async () => model!.notebookProps.onUpdateTodo("a", "Single direction"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)); });
  check(files.get(today)?.content?.includes("Single direction"), "Turning sync off retains the original one-way autosave");

  await act(async () => saveTodoFileSync(true));
  await stable();
  now += 86400000;
  await tick(30000);
  await stable();
  check(model!.notebookProps.currentDate !== today && paths.some(path => path.endsWith(model!.notebookProps.currentDate)), "Rollover switches the watcher to the new daily filename");
  await act(async () => saveSaveDirectory("D:/other-notes"));
  await stable();
  check(paths[paths.length - 1]?.startsWith("D:/other-notes/"), "A saved path change restarts sync in the new folder, including embedded settings");
  await act(async () => root.unmount());
  check(![...ticks.values()].some(timer => timer.period === 1500), "Unmount releases the polling timer");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  messages.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
  console.error(error);
} finally {
  document.getElementById("results")!.textContent = messages.join("\n");
  Object.defineProperty(window, "Date", { configurable: true, value: RealDate });
  window.setInterval = realInterval;
  window.clearInterval = realClear;
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("fly-island-"))) if (!original.has(key)) localStorage.removeItem(key);
  for (const [key, value] of original) localStorage.setItem(key, value);
}
