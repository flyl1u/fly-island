import type { TodoItem } from "../../features/todos/types";
import { clamp } from "../../utils/number.ts";
import { getCollapsedTextUnits, getTodoTitleLineCount } from "../../utils/text.ts";

export const MIN_COLLAPSED_ISLAND_WIDTH = 280;
export const MAX_COLLAPSED_ISLAND_WIDTH = 340;
export const MIN_COLLAPSED_TEXT_UNITS = 2;
export const MAX_COLLAPSED_TEXT_UNITS = 12;
export const BASE_EXPANDED_ISLAND_HEIGHT = 306;
export const TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT = 352;
export const MUSIC_EXPANDED_ISLAND_HEIGHT = 320;
export const MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT = 320;
// Expanded island around an empty clipboard list: island padding, header and gap (86),
// then the panel's padding, title, tabs, search and their gaps (158).
const CLIPBOARD_CHROME_HEIGHT = 244;
// One history row (62) plus the gap below it.
const CLIPBOARD_ROW_PITCH = 70;
const CLIPBOARD_ROW_GAP = 8;
export const TODO_ROW_HEIGHT = 46;
export const TODO_GROW_START_ROWS = 2;
export function getCollapsedIslandWidth(text: string) {
  const visualUnits = getCollapsedTextUnits(text);
  const widthProgress =
    (clamp(
      visualUnits,
      MIN_COLLAPSED_TEXT_UNITS,
      MAX_COLLAPSED_TEXT_UNITS,
    ) -
      MIN_COLLAPSED_TEXT_UNITS) /
    (MAX_COLLAPSED_TEXT_UNITS - MIN_COLLAPSED_TEXT_UNITS);

  return Math.round(
    MIN_COLLAPSED_ISLAND_WIDTH +
      widthProgress *
        (MAX_COLLAPSED_ISLAND_WIDTH - MIN_COLLAPSED_ISLAND_WIDTH),
  );
}

// Widest nudge allowed when aligning; covers the 1.25x and 1.75x display scales.
const MAX_ALIGNMENT_NUDGE = 4;

/**
 * The stage centres the island, so an odd width leaves it on a half pixel. The
 * compositor draws it there while the collapse animation runs and snaps it to
 * a whole device pixel when the animation ends, which shows as a jump. This
 * picks the nearest width whose centred left edge is a whole device pixel.
 */
export function alignCollapsedIslandWidth(
  width: number,
  stageWidth: number,
  devicePixelRatio: number,
) {
  const isAligned = (candidate: number) => {
    const left = ((stageWidth - candidate) / 2) * devicePixelRatio;
    return Math.abs(left - Math.round(left)) < 0.001;
  };

  for (let nudge = 0; nudge <= MAX_ALIGNMENT_NUDGE; nudge++) {
    for (const candidate of [width - nudge, width + nudge]) {
      if (
        candidate >= MIN_COLLAPSED_ISLAND_WIDTH &&
        candidate <= MAX_COLLAPSED_ISLAND_WIDTH &&
        isAligned(candidate)
      ) {
        return candidate;
      }
    }
  }

  return width;
}

/** Todo rows the expanded panel grows to before the list scrolls, within the tallest panel allowed. */
export function getTodoScrollStartRows(maxPanelHeight: number) {
  return (
    TODO_GROW_START_ROWS +
    Math.max(0, Math.floor((maxPanelHeight - BASE_EXPANDED_ISLAND_HEIGHT) / TODO_ROW_HEIGHT))
  );
}

export function getTodoVisualRows(todoList: TodoItem[]) {
  return todoList.reduce(
    (total, todo) => total + getTodoTitleLineCount(todo.title),
    0,
  );
}

// Expanded island around an empty Agent session list: island padding, header and gap (86),
// then the panel's padding (14 + 12), title (18) and the gap below it (8). Keep in step with
// AgentSessionsPanel.css.
const AGENT_PAGE_CHROME_HEIGHT = 138;
// One session row (93, fixed in AgentSessionsPanel.css) plus the gap below it.
const AGENT_ROW_PITCH = 99;
const AGENT_ROW_GAP = 6;

/** Expanded height that fits exactly `rows` Agent session rows. */
export function getAgentPageExpandedHeight(rows: number) {
  return AGENT_PAGE_CHROME_HEIGHT + rows * AGENT_ROW_PITCH - AGENT_ROW_GAP;
}

/** Expanded height that fits exactly `rows` clipboard history rows. */
export function getClipboardExpandedHeight(rows: number) {
  return CLIPBOARD_CHROME_HEIGHT + rows * CLIPBOARD_ROW_PITCH - CLIPBOARD_ROW_GAP;
}
