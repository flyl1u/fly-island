import type { PluginMenu } from "./api";

/**
 * Which plugin menu a right click on `element` is for, and which entry, from
 * the row's data attributes: a todo in the todo list (`data-todo-id`), a
 * clipboard text entry (`data-clipboard-id`), a file shelf entry
 * (`data-shelf-id`), a QQ notification (`data-message-id`) or a mail
 * (`data-mail-id`). Null anywhere else.
 */
export function menuTarget(element: Element): { menu: PluginMenu; itemId: string } | null {
  const rows: [string, string, PluginMenu][] = [
    [".todo-list [data-todo-id]", "data-todo-id", "todo/context"],
    ["[data-clipboard-id]", "data-clipboard-id", "clipboard/context"],
    ["[data-shelf-id]", "data-shelf-id", "shelf/context"],
    ["[data-message-id]", "data-message-id", "message/context"],
    ["[data-mail-id]", "data-mail-id", "message/context"],
  ];
  for (const [selector, attribute, menu] of rows) {
    const itemId = element.closest(selector)?.getAttribute(attribute);
    if (itemId) return { menu, itemId };
  }
  return null;
}
