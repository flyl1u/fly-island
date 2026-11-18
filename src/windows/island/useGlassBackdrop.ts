import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getIslandBackdrop, type IslandBackdrop } from "./api";
import { backdropPlacement } from "./glassBackdrop";

/** The wallpaper rarely changes; a slideshow or a new picture shows within this. */
const REFRESH_MS = 20_000;
/** A drag or a tuck slide moves the window every frame: ask again once it has settled. */
const MOVE_SETTLE_MS = 400;
const VARIABLES = ["--glass-backdrop-image", "--glass-backdrop-x", "--glass-backdrop-y", "--glass-backdrop-size"];

function clearBackdrop(root: HTMLElement) {
  delete root.dataset.glassBackdrop;
  for (const name of VARIABLES) root.style.removeProperty(name);
}

/**
 * The glass materials' real backdrop: the wallpaper under the island's monitor, blurred by
 * `blur` (0–100) in Rust (island/backdrop.rs) and kept on the document root as CSS variables.
 * Written straight to the root rather than through React state, so a window that moves every
 * frame (a drag, a tuck slide) only shifts a still layer and renders nothing. While the picture
 * is not ready, `data-glass-backdrop` is absent and the glass keeps its plain tinted look.
 */
export function useGlassBackdrop(enabled: boolean, blur: number) {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled || !isTauri()) {
      clearBackdrop(root);
      return;
    }
    const appWindow = getCurrentWindow();
    let didCancel = false;
    let key: string | null = null;
    let monitor: IslandBackdrop | null = null;
    let position = { x: 0, y: 0 };
    let scale = 1;
    let settleTimer = 0;
    const unlisteners: (() => void)[] = [];

    const place = () => {
      if (!monitor) return;
      for (const [name, value] of Object.entries(backdropPlacement(monitor, position, scale))) root.style.setProperty(name, value);
    };
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const next = await getIslandBackdrop(blur, key);
        if (didCancel) return;
        monitor = next;
        place();
        if (next.dataUrl) {
          root.style.setProperty("--glass-backdrop-image", `url("${next.dataUrl}")`);
          root.dataset.glassBackdrop = "ready";
          key = next.key;
        }
      } catch (error) {
        console.warn("Glass backdrop unavailable", error);
      }
    };
    const refreshSoon = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => void refresh(), MOVE_SETTLE_MS);
    };
    const keep = (unlisten: () => void) => { if (didCancel) unlisten(); else unlisteners.push(unlisten); };

    void Promise.all([appWindow.outerPosition(), appWindow.scaleFactor()])
      .then(([outer, factor]) => {
        position = { x: outer.x, y: outer.y };
        scale = factor;
        return refresh();
      })
      .catch((error) => console.warn("Glass backdrop: window position unavailable", error));
    void appWindow.onMoved(({ payload }) => {
      position = { x: payload.x, y: payload.y };
      place();
      refreshSoon();
    }).then(keep);
    void appWindow.onScaleChanged(({ payload }) => {
      scale = payload.scaleFactor;
      place();
      refreshSoon();
    }).then(keep);
    const interval = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      didCancel = true;
      window.clearTimeout(settleTimer);
      window.clearInterval(interval);
      for (const unlisten of unlisteners) unlisten();
    };
  }, [enabled, blur]);
}
