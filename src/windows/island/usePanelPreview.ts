import { useEffect, useRef } from "react";
import { PANEL_PREVIEW_STORAGE_KEY, parsePanelPreview } from "../settings/storage";
import type { IslandMode } from "./types";

// A preview closes this long after the last slider change in the settings window.
const PREVIEW_IDLE_MS = 1_500;

type PanelPreviewOptions = {
  mode: IslandMode;
  onExpand: () => void;
  onCollapse: () => void;
  onReveal: () => void;
};

/**
 * Shows the island in the state a settings slider affects while it moves: expanded
 * for the panel size, collapsed for the collapsed size. A panel opened for a preview
 * closes once the slider rests, unless the user pressed inside it; a panel the user
 * opened is left alone.
 */
export function usePanelPreview({ mode, onExpand, onCollapse, onReveal }: PanelPreviewOptions) {
  const modeRef = useRef(mode);
  const openedByPreviewRef = useRef(false);
  const idleTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === "collapsed") {
      openedByPreviewRef.current = false;
    }
  }, [mode]);

  useEffect(() => {
    const keepOpen = () => {
      openedByPreviewRef.current = false;
      window.clearTimeout(idleTimerRef.current);
    };

    window.addEventListener("pointerdown", keepOpen, true);
    return () => window.removeEventListener("pointerdown", keepOpen, true);
  }, []);

  useEffect(() => {
    const closePreview = () => {
      window.clearTimeout(idleTimerRef.current);
      if (openedByPreviewRef.current) {
        openedByPreviewRef.current = false;
        onCollapse();
      }
    };

    const showPreview = (event: StorageEvent) => {
      if (event.key !== PANEL_PREVIEW_STORAGE_KEY) {
        return;
      }

      const request = parsePanelPreview(event.newValue);

      if (request === "expanded") {
        if (modeRef.current === "collapsed") {
          openedByPreviewRef.current = true;
          onExpand();
        }
        if (openedByPreviewRef.current) {
          window.clearTimeout(idleTimerRef.current);
          idleTimerRef.current = window.setTimeout(closePreview, PREVIEW_IDLE_MS);
        }
      } else if (request === "collapsed") {
        if (openedByPreviewRef.current) {
          closePreview();
        } else if (modeRef.current === "collapsed") {
          // A tucked island slides back into view so its new size is visible.
          onReveal();
        }
      }
    };

    window.addEventListener("storage", showPreview);
    return () => {
      window.removeEventListener("storage", showPreview);
      window.clearTimeout(idleTimerRef.current);
    };
  }, [onCollapse, onExpand, onReveal]);
}
