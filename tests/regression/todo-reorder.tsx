import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/i18n";
import { TodoNotebookTasks } from "../../src/features/todos/TodoNotebookTasks";
import { useTodoList } from "../../src/features/todos/useTodoList";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/features/todos/TodoNotebook.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const noop = () => {};
let moves: [string, number][] = [];
function Harness() {
  const list = useTodoList(noop);
  return <TodoNotebookTasks displayedTodos={list.todos} draft="" draftDate={null}
    currentDate="2026-11-12" activeTodoId={null} enableTodoReorder scrollStartRows={3}
    onDraftChange={noop} onDraftDateChange={noop} onAddTodo={noop} onToggleTodo={noop}
    onUpdateTodo={noop} onStartTodo={noop} onDeleteTodo={noop}
    onReorderTodo={(id, index) => { moves.push([id, index]); list.moveTodoToIndex(id, index); }} />;
}
const messages: string[] = [];
const results = document.getElementById("results")!;
const order = () => [...document.querySelectorAll<HTMLElement>("[data-todo-id]")].map((row) => row.dataset.todoId).join(",");
function check(value: unknown, label: string) {
  if (!value) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const row = (id: string) => document.querySelector<HTMLElement>(`[data-todo-id="${id}"]`)!;
const handle = (id: string) => row(id).querySelector<HTMLButtonElement>(".todo-drag-handle")!;
async function pointer(id: string, type: string, y: number) {
  await act(async () => {
    handle(id).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
      pointerId: 1, button: 0, clientX: 450, clientY: y }));
  });
}
async function frame() {
  await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
}

try {
  // 本回归页只使用自己的测试数据。
  localStorage.setItem("focusd-island-todos", JSON.stringify(["a", "b", "c"].map((id) => ({
    id, title: id, completed: false, createdAt: 0,
  }))));
  await act(async () => {
    createRoot(document.getElementById("fixture")!).render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>);
  });
  check(order() === "a,b,c", "初始顺序");
  let y = row("a").getBoundingClientRect().top + 16;
  await pointer("a", "pointerdown", y);
  await pointer("a", "pointermove", y + 2);
  await frame();
  check(!row("a").classList.contains("todo-item--dragging"), "4px 以内不启动拖动");
  y = row("c").getBoundingClientRect().bottom + 10;
  await pointer("a", "pointermove", y);
  await frame();
  check(order() === "b,c,a", "拖动中 DOM 顺序实时变化");
  check(moves.length === 0, "预览不提交真实顺序");
  check(row("a").style.transform.includes("translateY"), "被拖行通过内联变换跟手");
  await pointer("a", "pointerup", y);
  check(order() === "b,c,a" && JSON.stringify(moves) === '[["a",2]]', "松手按最终 index 提交");
  check(JSON.parse(localStorage.getItem("focusd-island-todos")!).map((item: { id: string }) => item.id).join(",") === "b,c,a", "松手顺序持久化");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
  check(!row("a").style.transform && row("a").getAnimations().length === 0, "落位结束清理变换");
  moves = [];
  y = row("a").getBoundingClientRect().top + 16;
  await pointer("a", "pointerdown", y);
  await pointer("a", "pointermove", row("b").getBoundingClientRect().top - 10);
  await frame();
  check(order() === "a,b,c", "上拖实时预览");
  await pointer("a", "pointercancel", y);
  check(order() === "b,c,a" && moves.length === 0, "pointercancel 恢复原顺序且不提交");
  await pointer("a", "pointerdown", y);
  await pointer("a", "pointermove", row("b").getBoundingClientRect().top - 10);
  await frame();
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  check(order() === "b,c,a" && moves.length === 0, "Esc 丢弃预览");
  results.textContent = messages.join("\n");
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
}
