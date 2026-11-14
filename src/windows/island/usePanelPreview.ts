import { useCallback, useEffect, useRef } from "react";
import { PANEL_PREVIEW_STORAGE_KEY } from "../settings/storage";
import { parsePanelPreview, PREVIEW_IDLE_MS } from "../settings/panelPreview";
import { listenIslandHover } from "./api";
import { previewTarget, shouldRestorePreview, type PreviewSnapshot } from "./panelPreviewPlan";
import type { useIslandNavigation } from "./useIslandNavigation";

type PreviewOptions = {
  navigation: ReturnType<typeof useIslandNavigation>;
  quiet: boolean;
  hasMessagePreview: boolean;
};

/** A settings preview borrows navigation until it rests or the user takes over. */
export function usePanelPreview(options: PreviewOptions) {
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<{ original: PreviewSnapshot; target: PreviewSnapshot } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hovering = useRef(false);
  const finish = useCallback((restore: boolean) => {
    const ended = session.current;
    if (!ended) return;
    session.current = null;
    window.clearTimeout(timer.current);
    const { navigation, quiet, hasMessagePreview } = latest.current;
    const canRestore = restore && shouldRestorePreview(ended.target, navigation, {
      hovering: hovering.current || Boolean(document.querySelector(".island:hover")),
      interacted: false,
      blocked: quiet || hasMessagePreview,
    });
    navigation.setIsPreviewing(false);
    if (canRestore) navigation.applyPreviewState(ended.original);
  }, []);

  useEffect(() => {
    if (options.quiet || options.hasMessagePreview) finish(false);
  }, [finish, options.quiet, options.hasMessagePreview]);

  useEffect(() => {
    const takeOver = () => finish(false);
    const showPreview = (event: StorageEvent) => {
      if (event.key !== PANEL_PREVIEW_STORAGE_KEY) return;
      const request = parsePanelPreview(event.newValue);
      const { navigation, quiet, hasMessagePreview } = latest.current;
      if (!request || quiet || hasMessagePreview) return;
      // Preserve the first state across repeated changes and changes of preview mode.
      const original = session.current?.original ?? {
        mode: navigation.mode, page: navigation.page, isTucked: navigation.isTucked,
        retractsAfterPeek: navigation.retractsAfterPeek, peekRetractDelayMs: navigation.peekRetractDelayMs,
      };
      const target = previewTarget(request, navigation);
      session.current = { original, target };
      navigation.setIsPreviewing(true);
      navigation.applyPreviewState(target);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => finish(true), PREVIEW_IDLE_MS);
    };
    window.addEventListener("storage", showPreview);
    window.addEventListener("pointerdown", takeOver, true);
    window.addEventListener("keydown", takeOver, true);
    return () => {
      window.removeEventListener("storage", showPreview);
      window.removeEventListener("pointerdown", takeOver, true);
      window.removeEventListener("keydown", takeOver, true);
      window.clearTimeout(timer.current);
    };
  }, [finish]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenIslandHover((inside) => {
      hovering.current = inside;
      if (inside) finish(false);
    }).then((next) => {
      if (cancelled) next();
      else unlisten = next;
    }).catch((error) => console.error("Failed to listen for preview hover", error));
    return () => { cancelled = true; unlisten?.(); };
  }, [finish]);
}
