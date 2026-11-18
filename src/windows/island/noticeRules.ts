import type { IslandSettings } from "../../features/appearance/types";
import type { IslandMode } from "./types";

type NoticeSettings = Pick<IslandSettings, "messagePreviewSeconds" | "messageAutoExpand" | "messageExpandSeconds" | "gameShowNotices" | "gameNoticeSeconds">;

/**
 * How long a message preview stays: game mode's own seconds while it is quiet (previews show there
 * only with gameShowNotices), the adaptive preview's while that is on (a long text takes longer to
 * read), otherwise the usual preview seconds.
 */
export function previewSecondsFor(settings: NoticeSettings, quiet: boolean) {
  if (quiet && settings.gameShowNotices) return settings.gameNoticeSeconds;
  return settings.messageAutoExpand ? settings.messageExpandSeconds : settings.messagePreviewSeconds;
}

/**
 * Whether the cursor passes through the island: while game mode is quiet and a preview shows on
 * the collapsed island, so a click meant for the game never lands on it or takes the focus.
 */
export function noticePassesClicks(quiet: boolean, hasPreview: boolean, mode: IslandMode) {
  return quiet && hasPreview && mode === "collapsed";
}

export function canPreviewNotice(settings: Pick<IslandSettings, "gameShowNotices" | "revealOnMessage">, quiet: boolean, mode: IslandMode, tucked: boolean) {
  return mode === "collapsed" && (quiet ? settings.gameShowNotices : !tucked || settings.revealOnMessage);
}
