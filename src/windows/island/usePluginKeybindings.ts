import { useEffect, useRef } from "react";
import { listenPluginKeybindings, runPluginCommand } from "../../features/plugins/api";
import { evaluateWhen, type WhenContext } from "../../features/plugins/when";
import type { IslandMode, IslandPage } from "./types";

type KeybindingContext = {
  mode: IslandMode;
  page: IslandPage;
  hasActiveTodo: boolean;
};

/**
 * Runs a plugin command when its global shortcut is pressed and its `when` clause
 * holds for the island right now. The host registers the shortcuts; the island
 * decides, because only it knows which page is open.
 */
export function usePluginKeybindings({ mode, page, hasActiveTodo }: KeybindingContext) {
  const context = useRef<WhenContext>({});
  context.current = {
    "island.expanded": mode === "expanded",
    "island.page": page,
    "todos.hasActive": hasActiveTodo,
  };

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenPluginKeybindings(({ pluginId, command, when }) => {
      if (!evaluateWhen(when, context.current)) return;
      void runPluginCommand(pluginId, command).catch((error: unknown) => {
        console.error("Failed to run a plugin command from its shortcut", error);
      });
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for plugin shortcuts", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
