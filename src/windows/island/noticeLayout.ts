import { getCollapsedTextUnits } from "../../utils/text.ts";

// Keep in step with src-tauri/src/island/geometry.rs (STAGE_WINDOW_WIDTH / HEIGHT / PADDING_Y):
// the grown island must stay inside the stage window, at any collapsed scale.
const STAGE_WIDTH = 820;
const STAGE_MIN_HEIGHT = 460;
const STAGE_PADDING_Y = 24;
const STAGE_SIDE_ROOM = 40;

// The reader's box (MessageNoticeReader.css): side padding, the rows above and below the text,
// the header row (source icon, sender, copy and open buttons) and the gap under it.
const SIDE_PADDING = 18;
const VERTICAL_PADDING = 10;
const HEADER_HEIGHT = 24;
const HEADER_GAP = 4;
// Icon, gaps and the two 24px buttons beside the sender.
const HEADER_CHROME = 16 + 7 + 8 + 24 + 4 + 24;
// The one-line preview's chrome: the agent light, the source icon and gaps (CollapsedMessageContent).
const ONE_LINE_CHROME = 70;
// A 13px glyph: a wide one is about 13px; text units count narrow ones as 0.55 of that.
const UNIT_WIDTH = 13;
const LINE_HEIGHT = 13 * 1.5;

export type NoticeText = { sender: string; body: string };
export type NoticeLimits = {
  maxWidth: number;
  maxHeight: number;
  /** The collapsed island's own size, which a notice never goes below. */
  baseWidth: number;
  baseHeight: number;
  fontScale: number;
  collapsedScale: number;
  /** Mail always gets selectable text and a copy action, even with a short subject. */
  forceReader?: boolean;
};
/** `reader`: the two-part reader (sender, then the wrapped text); false keeps the one-line preview, only wider. */
export type NoticeSize = { width: number; height: number; scrolls: boolean; reader: boolean };

/**
 * The size an adaptive message preview grows the collapsed island to, before the collapsed scale,
 * or null when the message fits the one-line preview as it is. It grows wider first, while the
 * message fits one line; past the width limit it turns into the reader and grows taller. Text is measured by estimate
 * (text units), not laid out: a little short and the reader scrolls, a little long and it has
 * a few pixels to spare. Never larger than the limits, nor than the stage window allows.
 */
export function getNoticeSize({ sender, body }: NoticeText, limits: NoticeLimits): NoticeSize | null {
  const unit = UNIT_WIDTH * limits.fontScale;
  const textWidth = (text: string) => Math.ceil(getCollapsedTextUnits(text) * unit);
  const paragraphs = body.split(/\r?\n/);
  const oneLine = textWidth(`${sender} · ${body}`) + ONE_LINE_CHROME;
  if (!limits.forceReader && paragraphs.length <= 1 && oneLine <= limits.baseWidth) return null;

  const scale = limits.collapsedScale > 0 ? limits.collapsedScale : 1;
  const widest = Math.min(limits.maxWidth, Math.floor((STAGE_WIDTH - STAGE_SIDE_ROOM) / scale));
  // Wider first: a message that fits one line within the limit stays one line.
  if (!limits.forceReader && paragraphs.length <= 1 && oneLine <= widest) {
    return { width: Math.max(limits.baseWidth, alignNoticeWidth(oneLine + 8, widest)), height: limits.baseHeight, scrolls: false, reader: false };
  }
  const tallest = Math.min(limits.maxHeight, Math.floor((STAGE_MIN_HEIGHT - STAGE_PADDING_Y) / scale));
  const natural = Math.max(
    textWidth(sender) + HEADER_CHROME,
    ...paragraphs.map(textWidth),
  ) + SIDE_PADDING * 2;
  const width = Math.max(240, alignNoticeWidth(Math.min(widest, Math.max(limits.baseWidth, natural)), widest));
  const textRoom = Math.max(1, width - SIDE_PADDING * 2);
  const lines = Math.max(1, paragraphs.reduce((total, line) => total + Math.max(1, Math.ceil(textWidth(line) / textRoom)), 0));
  const wanted = Math.ceil(VERTICAL_PADDING * 2 + HEADER_HEIGHT + HEADER_GAP + lines * LINE_HEIGHT * limits.fontScale);
  return { width, height: Math.max(limits.baseHeight, Math.min(tallest, wanted)), scrolls: wanted > tallest, reader: true };
}

/**
 * The stage (820 wide) centres the island; a width of 4 more than a multiple of 8 puts its left
 * edge on a whole device pixel at the 1x, 1.25x, 1.5x and 2x display scales, so it does not jump
 * when the resize animation ends (alignCollapsedIslandWidth explains the jump).
 */
function alignNoticeWidth(width: number, widest: number) {
  const aligned = Math.round((width - 4) / 8) * 8 + 4;
  return aligned > widest ? aligned - 8 : aligned;
}
