import { useMemo } from "react";
import type { IslandSettings } from "../../features/appearance/types";
import { noticeText, type MessagePreview } from "../../features/messages/messagePreview";
import { useTranslation } from "../../i18n";
import { getNoticeSize } from "./noticeLayout";
import { noticePassesClicks } from "./noticeRules";
import type { IslandMode } from "./types";
import type { IslandNotice } from "./useIslandWindow";

type MessageNoticeOptions = { mode: IslandMode; isTucked: boolean; quiet: boolean; collapsedIslandWidth: number };

/**
 * The adaptive message preview (Settings → Messages): the size the collapsed island grows to for
 * the preview showing, null while it fits one line or the setting is off; and what the native
 * window needs to know of it (its hit area, and passing clicks through in game mode).
 */
export function useMessageNotice(preview: MessagePreview | null, settings: IslandSettings, { mode, isTucked, quiet, collapsedIslandWidth }: MessageNoticeOptions) {
  const t = useTranslation();
  const grows = settings.messageAutoExpand && preview !== null && mode === "collapsed" && !isTucked;
  const size = useMemo(() => grows && preview ? getNoticeSize(noticeText(preview, t.messages), {
    maxWidth: settings.messageExpandMaxWidth,
    maxHeight: settings.messageExpandMaxHeight,
    baseWidth: collapsedIslandWidth,
    baseHeight: settings.collapsedHeight,
    fontScale: settings.islandFontPercent / 100,
    collapsedScale: settings.collapsedScale,
    forceReader: preview.source === "qqMail",
  }) : null, [collapsedIslandWidth, grows, preview, settings.collapsedHeight, settings.collapsedScale, settings.islandFontPercent,
    settings.messageExpandMaxHeight, settings.messageExpandMaxWidth, t.messages]);
  const nativeNotice: IslandNotice = {
    width: size?.width ?? null,
    height: size?.height ?? null,
    clickThrough: noticePassesClicks(quiet, preview !== null, mode),
  };
  return { size, nativeNotice };
}
