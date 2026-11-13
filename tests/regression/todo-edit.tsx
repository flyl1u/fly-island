// pnpm dev, then open /tests/regression/todo-edit.html. Editing a todo's title in place: a title
// that wraps keeps all its lines while edited (a one-line input showed only the first), Enter
// saves, Shift+Enter adds no line, Escape cancels.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { TodoListItem } from "../../src/features/todos/TodoListItem";
import type { TodoItem } from "../../src/features/todos/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");

const LONG_TITLE = "整理下周发布要用的说明文档，把设置页、待办页和剪贴板的截图都换成新的界面，再请两位同事各自读一遍挑错";
const log: string[] = [];
let todo: TodoItem = { id: "t1", title: LONG_TITLE, completed: false, createdAt: 0 };

function Harness() {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [item, setItem] = useState(todo);
  const noop = () => {};
  return (
    <div className="todo-list" role="list">
      <TodoListItem
        todo={item}
        isTodayMode
        isActive={false}
        canReorder={false}
        isDragging={false}
        isEditing={editing}
        titleDraft={draft}
        onTitleDraftChange={setDraft}
        onCommitEdit={() => {
          log.push(`commit:${draft}`);
          todo = { ...item, title: draft.trim() || item.title };
          setItem(todo);
          setEditing(false);
        }}
        onCancelEdit={() => { log.push("cancel"); setEditing(false); }}
        onStartEdit={(next) => { setDraft(next.title); setEditing(true); }}
        onToggle={noop}
        onStart={noop}
        onDelete={noop}
        onDragStart={noop}
      />
    </div>
  );
}

const messages: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const results = document.getElementById("results")!;
const field = () => document.querySelector<HTMLTextAreaElement>(".todo-title-input");
const titleButton = () => document.querySelector<HTMLButtonElement>(".todo-title--editable");
const lines = (element: HTMLElement) => Math.round(element.clientHeight / parseFloat(getComputedStyle(element).lineHeight));
const key = (init: KeyboardEventInit) => act(async () => {
  field()!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
});
/** Types into the controlled textarea the way a user would, so React sees the change. */
const type = (value: string) => act(async () => {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(field(), value);
  field()!.dispatchEvent(new Event("input", { bubbles: true }));
});

try {
  await act(async () => { createRoot(document.getElementById("fixture")!).render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>); });
  const shownLines = lines(titleButton()!);
  check(shownLines >= 2, `长标题在列表里折成多行（${shownLines} 行）`);

  await act(async () => { titleButton()!.click(); });
  const editor = field()!;
  check(editor instanceof HTMLTextAreaElement && document.activeElement === editor && editor.value === LONG_TITLE, "点标题进入编辑，焦点在编辑框里，内容是整段标题");
  check(editor.scrollHeight <= editor.clientHeight + 1 && lines(editor) === shownLines,
    `编辑时保持原来的行数，整段文字都看得见（${lines(editor)} 行 / 原来 ${shownLines} 行）`);
  check(editor.selectionStart === LONG_TITLE.length, "光标在标题末尾");

  await type(`${LONG_TITLE}，最后再补一句很长的话让它多折一行出来看看是不是会跟着长高`);
  check(lines(field()!) > shownLines && field()!.scrollHeight <= field()!.clientHeight + 1, `文字变长时编辑框跟着长高（${lines(field()!)} 行）`);
  await type("第一行\n第二行");
  check(field()!.value === "第一行 第二行", "粘贴进来的换行变成空格，标题仍是一段");

  await key({ key: "Enter", shiftKey: true });
  check(field() !== null && !log.some((entry) => entry.startsWith("commit")), "Shift+Enter 不保存、不换行");
  await key({ key: "Enter", isComposing: true });
  check(field() !== null && !log.some((entry) => entry.startsWith("commit")), "中文输入法选词时的 Enter 不保存");
  await key({ key: "Enter" });
  check(field() === null && titleButton()?.textContent === "第一行 第二行" && log.includes("commit:第一行 第二行"), "Enter 保存并退出编辑");

  await act(async () => { titleButton()!.click(); });
  await type("不要的改动");
  await key({ key: "Escape" });
  check(field() === null && titleButton()?.textContent === "第一行 第二行" && log[log.length - 1] === "cancel", "Esc 取消，标题不变");

  results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
  results.dataset.result = "passed";
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
  results.dataset.result = "failed";
  console.error(error);
}
