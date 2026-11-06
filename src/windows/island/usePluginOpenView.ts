import { useEffect, useRef } from "react";
import { listenPluginOpenView } from "../../features/plugin-views/api";
import { pluginPageId } from "../../features/plugin-views/model";
import type { PluginPageId } from "./types";

/**
 * Opens a plugin's page when it asks with island.openView (Rust has already
 * checked the user just used the plugin). A page the user hid in settings is
 * not on the island, so nothing opens.
 */
export function usePluginOpenView(pageIds: readonly PluginPageId[], onOpen: (page: PluginPageId) => void) {
  const latest = useRef({ pageIds, onOpen });
  latest.current = { pageIds, onOpen };

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenPluginOpenView(({ pluginId, viewId }) => {
      const page = pluginPageId(pluginId, viewId);
      if (latest.current.pageIds.includes(page)) latest.current.onOpen(page);
    })
      .then((next) => {
        if (didCancel) next();
        else unlisten = next;
      })
      .catch((error) => console.error("Failed to listen for plugin page requests", error));
    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);
}
