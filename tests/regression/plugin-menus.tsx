// pnpm dev, then open /tests/regression/plugin-menus.html.
// The plugin right-click menus (contributes.menus) on rows like the island's,
// with the Tauri boundary mocked: which menu a row opens and what is sent.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import "../../src/styles/tokens.css";
import { I18nProvider } from "../../src/i18n";
import { PluginContextMenus } from "../../src/features/plugins/PluginContextMenu";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });

const entry = (command: string, zh: string) => ({ pluginId: "me.demo", pluginName: { "zh-CN": "示例", en: "Demo" }, command, title: { "zh-CN": zh, en: command } });
const calls: { command: string; args: Record<string, unknown> }[] = [];
mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  calls.push({ command, args });
  if (command === "list_plugin_menu") {
    switch (args.menu) {
      case "todo/context": return [entry("push", "推送待办")];
      case "clipboard/context": return [entry("translate", "翻译这段")];
      case "shelf/context": return [entry("upload", "上传文件")];
      case "message/context": return [entry("reply", "快速回复")];
    }
  }
  return null;
}, { shouldMockEvents: true });
mockWindows("main");

createRoot(document.getElementById("fixture")!).render(
  <StrictMode>
    <I18nProvider>
      <ul className="todo-list"><li data-todo-id="t1">待办</li></ul>
      <article data-clipboard-id="c1">剪贴板文字</article>
      <article className="image-row">剪贴板图片（没有 id）</article>
      <article data-shelf-id="s1">文件</article>
      <article data-message-id="q1">QQ 通知</article>
      <button type="button" data-mail-id="7:18">邮件</button>
      <p id="plain">别处</p>
      <PluginContextMenus />
    </I18nProvider>
  </StrictMode>,
);

const results = document.getElementById("results")!;
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const menu = () => document.querySelector<HTMLElement>(".plugin-todo-menu");
/** Right-clicks `selector`; returns whether the page let the browser's own menu through. */
const rightClick = async (selector: string) => {
  let allowed = true;
  await act(async () => {
    const target = document.querySelector(selector)!;
    allowed = target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  });
  return allowed;
};
const pick = async () => {
  await act(async () => { menu()!.querySelector<HTMLButtonElement>("button")!.click(); });
  await wait(20);
};
const lastRun = () => { const runs = calls.filter((call) => call.command.startsWith("run_plugin")); return runs[runs.length - 1]; };

async function runChecks() {
  try {
    await wait(100);

    await rightClick("[data-todo-id]");
    check(menu()?.textContent?.includes("推送待办"), "右键待办列出插件的待办菜单");
    await pick();
    check(lastRun()?.command === "run_plugin_menu_command" && lastRun()?.args.todoId === "t1" && !menu(), "选中后按待办 id 发给插件，菜单关闭");

    const cases: [string, string, string, string][] = [
      ["[data-clipboard-id]", "翻译这段", "clipboard/context", "c1"],
      ["[data-shelf-id]", "上传文件", "shelf/context", "s1"],
      ["[data-message-id]", "快速回复", "message/context", "q1"],
      ["[data-mail-id]", "快速回复", "message/context", "7:18"],
    ];
    for (const [selector, title, menuName, itemId] of cases) {
      await rightClick(selector);
      check(menu()?.textContent?.includes(title), `${menuName}：右键 ${itemId} 列出插件的条目`);
      await pick();
      const run = lastRun();
      check(run?.command === "run_plugin_item_menu_command" && run.args.menu === menuName && run.args.itemId === itemId, `${menuName}：发给 Rust 的是条目 id ${itemId}`);
    }

    check(await rightClick(".image-row") && !menu(), "图片剪贴板条目没有插件菜单，保留默认右键");
    check(await rightClick("#plain") && !menu(), "别处右键不受影响");

    results.textContent = `${messages.join("\n")}\n\n全部 ${messages.length} 项检查通过。`;
    results.dataset.result = "passed";
  } catch (error) {
    results.textContent = `${messages.join("\n")}\nFAIL ${String(error)}`;
    results.dataset.result = "failed";
  }
}

void runChecks();
