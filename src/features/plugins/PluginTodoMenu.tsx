import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslation } from "../../i18n";
import { listPluginMenu, runPluginMenuCommand, TODO_CONTEXT_MENU, type PluginMenuEntry } from "./api";
import "./PluginTodoMenu.css";

const MENU_WIDTH = 188;
const ENTRY_HEIGHT = 34;
const EDGE = 6;

type OpenMenu = { x: number; y: number; todoId: string };

/**
 * Wraps the todo page: right-clicking a todo opens a menu of what running
 * plugins add to "todo/context". Without such plugins the right click is left alone.
 */
export function PluginTodoMenuArea({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const [entries, setEntries] = useState<PluginMenuEntry[]>([]);
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  // Plugins start and stop from the settings window, so look again whenever the island gets focus.
  const refresh = useCallback(() => {
    listPluginMenu(TODO_CONTEXT_MENU)
      .then(setEntries)
      .catch((error: unknown) => console.error("Failed to list plugin todo menu entries", error));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  const openMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const item = event.target instanceof Element ? event.target.closest(".todo-list [data-todo-id]") : null;
    const todoId = item?.getAttribute("data-todo-id");
    refresh();
    if (!todoId || entries.length === 0) return;
    event.preventDefault();
    const height = entries.length * ENTRY_HEIGHT + 8;
    setMenu({
      x: Math.max(EDGE, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - EDGE)),
      y: Math.max(EDGE, Math.min(event.clientY, window.innerHeight - height - EDGE)),
      todoId,
    });
  };

  const run = (entry: PluginMenuEntry, todoId: string) => {
    setMenu(null);
    void runPluginMenuCommand(entry.pluginId, TODO_CONTEXT_MENU, entry.command, todoId).catch((error: unknown) => {
      console.error("Failed to run a plugin todo menu command", error);
    });
  };

  return (
    <div className="plugin-todo-menu-area" onContextMenu={openMenu}>
      {children}
      {menu && entries.length > 0
        ? createPortal(
            <div
              className="plugin-todo-menu"
              role="menu"
              aria-label={t.todo.pluginMenu}
              style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {entries.map((entry) => (
                <button
                  className="plugin-todo-menu__item"
                  type="button"
                  role="menuitem"
                  key={`${entry.pluginId}/${entry.command}`}
                  onClick={() => run(entry, menu.todoId)}
                >
                  <span>{entry.title[locale]}</span>
                  <small>{entry.pluginName[locale]}</small>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
