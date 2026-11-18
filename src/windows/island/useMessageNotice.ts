import { useLayoutEffect, useMemo, useState } from "react";
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
  // What the laid-out one-line preview still overflowed by, for this preview; see measuredOverflow.
  const [measured, setMeasured] = useState({ at: -1, overflow: 0, tries: 0 });
  const measuredOverflow = preview && measured.at === preview.receivedAt ? measured.overflow : 0;
  const size = useMemo(() => grows && preview ? getNoticeSize(noticeText(preview, t.messages), {
    maxWidth: settings.messageExpandMaxWidth,
    maxHeight: settings.messageExpandMaxHeight,
    baseWidth: collapsedIslandWidth,
    baseHeight: settings.collapsedHeight,
    fontScale: settings.islandFontPercent / 100,
    collapsedScale: settings.collapsedScale,
    // Every source gets the selectable reader: the one-line bar is a button, whose text cannot be
    // selected and which opens the app on click (QQ / WeChat users wanted to copy too).
    forceReader: true,
    measuredOverflow,
  }) : null, [collapsedIslandWidth, grows, measuredOverflow, preview, settings.collapsedHeight, settings.collapsedScale, settings.islandFontPercent,
    settings.messageExpandMaxHeight, settings.messageExpandMaxWidth, t.messages]);
  // The estimate can fall short of the island as drawn (status icons beside the text, real glyph
  // widths): measure the one-line preview after layout and grow by what is still cut off.
  const receivedAt = preview?.receivedAt ?? null;
  const oneLine = grows && !size?.reader;
  useLayoutEffect(() => {
    if (!oneLine || receivedAt === null) return;
    const overflow = oneLinePreviewOverflow();
    if (overflow <= MIN_OVERFLOW) return;
    // A few rounds at most: each one grows by what is still cut off, so it settles in one or two.
    setMeasured((current) => {
      const same = current.at === receivedAt;
      if (same && current.tries >= MAX_MEASURES) return current;
      return { at: receivedAt, overflow: (same ? current.overflow : 0) + overflow, tries: (same ? current.tries : 0) + 1 };
    });
  }, [oneLine, receivedAt, size?.width]);
  const nativeNotice: IslandNotice = {
    width: size?.width ?? null,
    height: size?.height ?? null,
    clickThrough: noticePassesClicks(quiet, preview !== null, mode),
  };
  return { size, nativeNotice };
}

// Sub-pixel rounding and a few px of ellipsis slack are not cut-off text.
const MIN_OVERFLOW = 4;
const MAX_MEASURES = 3;

/**
 * How far the collapsed bar's one-line preview runs past its room, in the island's own px (the
 * bar is scaled by a transform, which scrollWidth leaves out): the widest overflow among the
 * elements in the text slot that clip, since which one clips depends on what the preview shows.
 */
function oneLinePreviewOverflow() {
  const slot = document.querySelector<HTMLElement>(".island--collapsed .island__text-slot");
  if (!slot) return 0;
  return [slot, ...slot.querySelectorAll<HTMLElement>("*")]
    .filter((element) => getComputedStyle(element).overflowX !== "visible")
    .reduce((widest, element) => Math.max(widest, element.scrollWidth - element.clientWidth), 0);
}
