import type { PanelPreviewMode } from "../settings/panelPreview";
import type { IslandMode, IslandPage } from "./types";

export type PreviewSnapshot = {
  mode: IslandMode;
  page: IslandPage;
  isTucked: boolean;
  retractsAfterPeek: boolean;
  peekRetractDelayMs: number | null;
};

export function previewTarget(request: PanelPreviewMode, current: PreviewSnapshot): PreviewSnapshot {
  return {
    ...current,
    mode: request === "expanded" ? "expanded" : "collapsed",
    isTucked: request === "tucked",
    retractsAfterPeek: false,
    peekRetractDelayMs: null,
  };
}

/** Navigation from a user or a full-screen app always wins over returning from a preview. */
export function shouldRestorePreview(target: PreviewSnapshot, current: PreviewSnapshot, activity: {
  hovering: boolean;
  interacted: boolean;
  blocked: boolean;
}) {
  return !activity.hovering && !activity.interacted && !activity.blocked
    && current.mode === target.mode && current.isTucked === target.isTucked && current.page === target.page;
}
