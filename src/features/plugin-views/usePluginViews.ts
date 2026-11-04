import { useCallback, useEffect, useRef, useState } from "react";
import { listenPluginViewChanged, listPluginViews, type PluginViewsSnapshot } from "./api";

const EMPTY: PluginViewsSnapshot = { views: [], status: [] };

/**
 * The plugin pages and status texts for the island. Read again when a plugin
 * starts, stops or changes a status text; view models are not kept here (each
 * page listens for its own), so model updates do not re-render the island.
 */
export function usePluginViews(): PluginViewsSnapshot {
  const [snapshot, setSnapshot] = useState<PluginViewsSnapshot>(EMPTY);
  const lastText = useRef(JSON.stringify(EMPTY));

  const refresh = useCallback(() => {
    listPluginViews()
      .then((next) => {
        const text = JSON.stringify(next);
        if (text === lastText.current) return;
        lastText.current = text;
        setSnapshot(next);
      })
      .catch((error: unknown) => console.error("Failed to list plugin views", error));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    refresh();
    void listenPluginViewChanged((change) => {
      if (change.kind !== "view") refresh();
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => console.error("Failed to listen for plugin view changes", error));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  return snapshot;
}
