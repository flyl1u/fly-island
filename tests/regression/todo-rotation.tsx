import { act } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/island/IslandCollapsedBar.css";
import "../../src/features/messages/CollapsedMessageContent.css";
import { I18nProvider } from "../../src/i18n";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import { useCollapsedTodo } from "../../src/windows/island/useCollapsedTodo";
import { CollapsedTodoContent } from "../../src/windows/island/CollapsedTodoContent";
import type { TodoItem } from "../../src/features/todos/types";
import type { TodoTimer } from "../../src/features/todos/timer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById("root")!);
const todos: TodoItem[] = ["First task", "核对录屏素材和脚本中的演示步骤", "Outside the chosen count"].map((title, i) => ({
  id: String(i), title, completed: false, createdAt: 0,
}));
let mode: "switch" | "scroll" = "switch";
let paused = false;
let timer: TodoTimer | null = null;
let measuredWidth = 0;
function Demo() {
  const state = useCollapsedTodo(todos, "2", {
    ...DEFAULT_SETTINGS, rotateTodos: true, todoRotationCount: 2, todoRotationSeconds: 1, todoRotationMode: mode,
  }, paused, null, { timer });
  measuredWidth = state.collapsedIslandWidth;
  return <div className="island__summary" style={{ width: 250, background: "#2f2f37", color: "white" }}>
    <div className="island__summary-row">
      <CollapsedTodoContent title={state.collapsedTaskTitle ?? ""} prefix="" rotation={state.todoRotation} />
    </div>
  </div>;
}
const render = () => act(async () => { root.render(<I18nProvider><Demo /></I18nProvider>); });
const checks: string[] = [];
function check(value: unknown, message: string) { if (!value) throw new Error(message); checks.push(`PASS ${message}`); }
const waitFor = async (predicate: () => boolean) => {
  const deadline = performance.now() + 4000;
  while (!predicate() && performance.now() < deadline) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  check(predicate(), "switch reaches the next task");
};
try {
  await render();
  const width = measuredWidth;
  check(document.querySelector(".todo-rotation")?.getAttribute("aria-label") === todos[0].title, "selection outside N starts at the first task");
  await waitFor(() => document.querySelector(".todo-rotation")?.getAttribute("aria-label") === todos[1].title);
  check(measuredWidth === width && document.querySelector(".todo-rotation")?.getBoundingClientRect().height === 28, "rotation keeps a fixed width and single row height");
  paused = true;
  await render();
  const title = document.querySelector(".todo-rotation")?.getAttribute("aria-label");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1150)); });
  check(document.querySelector(".todo-rotation")?.getAttribute("aria-label") === title, "previews, panels and tucking pause switching");
  mode = "scroll";
  paused = false;
  await render();
  const track = document.querySelector<HTMLElement>(".todo-rotation__track")!;
  check(track.children.length === 4 && track.children[0].textContent === track.children[2].textContent, "scroll duplicates exactly the first N tasks for a seamless loop");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  check(getComputedStyle(track).animationName === (reduced ? "none" : "todoContinuousScroll"), "scroll respects reduced motion");
  paused = true;
  await render();
  check(getComputedStyle(track).animationPlayState === "paused", "scroll pauses during hidden states");
  timer = { todoId: "2", endsAt: Date.now() + 60000, durationMinutes: 1, notified: false };
  await render();
  check(!document.querySelector(".todo-rotation__track") && document.querySelector(".todo-rotation")?.getAttribute("aria-label") === todos[2].title,
    "a timed task outside N takes exclusive priority");
  await act(async () => root.unmount());
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.documentElement.dataset.testResult = "failed";
  checks.push(`FAIL ${String(error)}`);
}
document.getElementById("results")!.textContent = checks.join("\n");
