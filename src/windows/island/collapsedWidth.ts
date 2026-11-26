import { getCollapsedTextUnits } from "../../utils/text.ts";
import { alignCollapsedIslandWidth } from "./layout.ts";

/** `fixedText`: the text only reserves room (the lyric line's placeholder) and is never drawn. */
export type CollapsedWidthContent = { text: string; extraWidth: number; brand?: string | null; fixedText?: boolean };
/** The drawn width of `text` in the collapsed bar's font, or 0 when it cannot be measured. */
export type MeasureCollapsedText = (text: string, role: "label" | "brand") => number;

// The estimate: about 13px per text unit (a CJK glyph is one unit).
const TEXT_UNIT_PX = 13;
// The title text and what follows it, as the summary row spaces them.
const BRAND_GAP = 8;
// With little or no text the open button still keeps room to be clicked: two CJK glyphs.
const MIN_TEXT_PX = 26;
// Sub-pixel rounding must not cut the last glyph off.
const TEXT_SLACK_PX = 2;

/**
 * Everything in the collapsed bar but the text, unscaled: the side space, each status slot at its
 * own width, and the gaps (one per status slot, with the text among them). None of these follows
 * the island's width, so the automatic width cannot feed back into itself.
 */
export function collapsedChromeWidth({ status, gap, padding, textExtras = 0 }: {
  status: readonly number[]; gap: number; padding: number; textExtras?: number;
}) {
  return status.reduce((total, width) => total + width, 0) + status.length * gap + padding + textExtras;
}

export function collapsedTextWidth({ text, brand, fixedText }: CollapsedWidthContent, fontScale: number, measure?: MeasureCollapsedText) {
  const width = (part: string, role: "label" | "brand") =>
    (!fixedText && measure?.(part, role)) || getCollapsedTextUnits(part) * fontScale * TEXT_UNIT_PX;
  if (brand && text) return width(brand, "brand") + BRAND_GAP + width(`· ${text}`, "label");
  if (brand) return width(brand, "brand");
  return text ? width(text, "label") : 0;
}

/**
 * The collapsed island's width before the island scale. Manual: the user's width. Automatic: what
 * the contents need, kept within `range`, so short contents give exactly the lower limit.
 */
export function collapsedWidthTarget({ manual, range, content, preview, fontScale, chrome, measure, stageWidth, devicePixelRatio }: {
  manual: number;
  range: { min: number; max: number } | null;
  content: CollapsedWidthContent;
  preview: CollapsedWidthContent | null;
  fontScale: number;
  chrome: number;
  measure?: MeasureCollapsedText;
  stageWidth: number;
  devicePixelRatio: number;
}) {
  if (!range) return manual;
  const shown = preview ?? content;
  const text = Math.max(MIN_TEXT_PX * fontScale, collapsedTextWidth(shown, fontScale, measure));
  const wanted = Math.ceil(chrome + text + Math.max(0, shown.extraWidth) + TEXT_SLACK_PX);
  const width = Math.min(range.max, Math.max(range.min, wanted));
  const aligned = alignCollapsedIslandWidth(width, stageWidth, devicePixelRatio, range.min, range.max);
  // Aligning may nudge a few px down: past the slack that would cut the text, so align upwards instead.
  if (aligned >= Math.min(wanted, range.max) - TEXT_SLACK_PX) return aligned;
  return alignCollapsedIslandWidth(Math.min(range.max, width + 4), stageWidth, devicePixelRatio, width, range.max);
}
