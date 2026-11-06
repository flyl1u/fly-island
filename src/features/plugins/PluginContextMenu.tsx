import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslation } from "../../i18n";
import {
  ITEM_CONTEXT_MENUS,
  listPluginMenu,
  runPluginItemMenuCommand,
  runPluginMenuCommand,
  TODO_CONTEXT_MENU,
  type PluginMenu,
  type PluginMenuEntry,
} from "./api";
import { menuTarget } from "./menuTarget.ts";
import "./PluginContextMenu.css";

const MENU_WIDTH = 188;
const ENTRY_HEIGHT = 34;
const EDGE = 6;
const MENUS: PluginMenu[] = [TODO_CONTEXT_MENU, ...ITEM_CONTEXT_MENUS];

type OpenMenu = { x: number; y: number; menu: PluginMenu; itemId: string };

/**
 * Right-clicking a todo, a clipboard text entry, a file shelf entry or a QQ
 * notification or mail opens a menu of what running plugins add to that
 * menu (contributes.menus). Rows say what they are with data attributes (see
 * menuTarget.ts). Without such plugins the right click is left alone.
 */
export function PluginContextMenus() {
  const t = useTranslation();
  const { locale } = useLocale();
  const [entries, setEntries] = useState<Partial<Record<PluginMenu, PluginMenuEntry[]>>>({});
  const [open, setOpen] = useState<OpenMenu | null>(null);

  // Plugins start and stop from the settings window, so look again whenever the island gets focus.
  const refresh = useCallback(() => {
    for (const menu of MENUS) {
      listPluginMenu(menu)
        .then((list) => setEntries((current) => ({ ...current, [menu]: list })))
        .catch((error: unknown) => console.error(`Failed to list plugin ${menu} entries`, error));
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  useEffect(() => {
    const openMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? menuTarget(event.target) : null;
      const list = target ? entries[target.menu] ?? [] : [];
      refresh();
      if (!target || list.length === 0) return;
      event.preventDefault();
      const height = list.length * ENTRY_HEIGHT + 8;
      setOpen({
        x: Math.max(EDGE, Math.min(event.clientX, window.innerWidth - MENU_WIDTH - EDGE)),
        y: Math.max(EDGE, Math.min(event.clientY, window.innerHeight - height - EDGE)),
        ...target,
      });
    };
    document.addEventListener("contextmenu", openMenu);
    return () => document.removeEventListener("contextmenu", openMenu);
  }, [entries, refresh]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
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
  }, [open]);

  const run = (entry: PluginMenuEntry, target: OpenMenu) => {
    setOpen(null);
    const sent =
      target.menu === TODO_CONTEXT_MENU
        ? runPluginMenuCommand(entry.pluginId, target.menu, entry.command, target.itemId)
        : runPluginItemMenuCommand(entry.pluginId, target.menu, entry.command, target.itemId);
    void sent.catch((error: unknown) => console.error("Failed to run a plugin menu command", error));
  };

  const list = open ? entries[open.menu] ?? [] : [];
  if (!open || list.length === 0) return null;
  return createPortal(
    <div
      className="plugin-todo-menu"
      role="menu"
      aria-label={t.todo.pluginMenu}
      style={{ left: open.x, top: open.y, width: MENU_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {list.map((entry) => (
        <button className="plugin-todo-menu__item" type="button" role="menuitem" key={`${entry.pluginId}/${entry.command}`} onClick={() => run(entry, open)}>
          <span>{entry.title[locale]}</span>
          <small>{entry.pluginName[locale]}</small>
        </button>
      ))}
    </div>,
    document.body,
  );
}
