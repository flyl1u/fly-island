import type { TodoItem } from "../../features/todos/types";
import type { AgentSessionView } from "../../features/appearance/types";
import { clamp } from "../../utils/number.ts";
import { getCollapsedTextUnits, getTodoTitleLineCount } from "../../utils/text.ts";

export const MIN_COLLAPSED_ISLAND_WIDTH = 280;
export const MAX_COLLAPSED_ISLAND_WIDTH = 340;
export const MIN_COLLAPSED_TEXT_UNITS = 2;
export const MAX_COLLAPSED_TEXT_UNITS = 12;
export const BASE_EXPANDED_ISLAND_HEIGHT = 306;
export const TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT = 352;
/** The calendar page: two days of events, scrolling past about six. */
export const CALENDAR_EXPANDED_ISLAND_HEIGHT = 340;
export const MUSIC_EXPANDED_ISLAND_HEIGHT = 320;
// Expanded island around an empty clipboard list: island padding, header and gap (86),
// then the panel's padding, title, tabs, search and their gaps (158).
const CLIPBOARD_CHROME_HEIGHT = 244;
// One history row (62) plus the gap below it.
const CLIPBOARD_ROW_PITCH = 70;
const CLIPBOARD_ROW_GAP = 8;
export const TODO_ROW_HEIGHT = 46;
export const TODO_GROW_START_ROWS = 2;
/** Collapsed width for the summary `text`, plus `extraWidth` px for plugin slots, up to the widest. */
export function getCollapsedIslandWidth(text: string, extraWidth = 0) {
  const visualUnits = getCollapsedTextUnits(text);
  const widthProgress =
    (clamp(
      visualUnits,
      MIN_COLLAPSED_TEXT_UNITS,
      MAX_COLLAPSED_TEXT_UNITS,
    ) -
      MIN_COLLAPSED_TEXT_UNITS) /
    (MAX_COLLAPSED_TEXT_UNITS - MIN_COLLAPSED_TEXT_UNITS);

  return Math.min(
    MAX_COLLAPSED_ISLAND_WIDTH,
    Math.round(
      MIN_COLLAPSED_ISLAND_WIDTH +
        widthProgress * (MAX_COLLAPSED_ISLAND_WIDTH - MIN_COLLAPSED_ISLAND_WIDTH) +
        Math.max(0, extraWidth),
    ),
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

// Expanded island around an empty Agent session list: island padding, header and gap (86), less
// the bottom padding (20) the list runs on through, then the list's top padding (4) and room
// below the last row (8). Keep in step with AgentSessionsPanel.css.
const AGENT_PAGE_CHROME_HEIGHT = 78;
// Each view's row and the gap below it: the tallest flat row (78, a two-line reply in
// AgentSessionsPanel.css; shorter replies and folded rows leave room for more sessions), a card
// (62) or a compact row (34) in AgentSessionCard.css. Keep in step with those files.
const AGENT_ROWS: Record<AgentSessionView, { height: number; gap: number }> = {
  list: { height: 78, gap: 2 },
  cards: { height: 62, gap: 6 },
  compact: { height: 34, gap: 4 },
};
// A usage line above the list (one per agent that reports usage): 22 plus 6 below it (AgentUsageBar.css).
const AGENT_USAGE_HEIGHT = 28;

/**
 * Expanded height that fits exactly `rows` Agent sessions, shown as `view`, below `usageLines`
 * usage lines (true: one).
 */
export function getAgentPageExpandedHeight(rows: number, usageLines: number | boolean = 0, view: AgentSessionView = "list") {
  const { height, gap } = AGENT_ROWS[view];
  return AGENT_PAGE_CHROME_HEIGHT + Number(usageLines) * AGENT_USAGE_HEIGHT + rows * (height + gap) - gap;
}

/** Expanded height around an alert's one-session card, whose row measured `rowHeight`. */
export function getAgentAlertExpandedHeight(rowHeight: number) {
  return AGENT_PAGE_CHROME_HEIGHT + rowHeight;
}

/** Expanded height that fits exactly `rows` clipboard history rows. */
export function getClipboardExpandedHeight(rows: number) {
  return CLIPBOARD_CHROME_HEIGHT + rows * CLIPBOARD_ROW_PITCH - CLIPBOARD_ROW_GAP;
}

// Plugin pages by template, before the panel height limit.
const PLUGIN_PAGE_HEIGHT = { list: 400, detail: 380, form: 400, status: 260, webview: 376 } as const;

// A plugin list: island padding and header (86), the page's padding and title (50),
// then one row (36) plus the gap below it per item, group title or search box.
const PLUGIN_LIST_CHROME_HEIGHT = 136;
const PLUGIN_LIST_ROW_PITCH = 40;
const PLUGIN_LIST_MIN_ROWS = 2;
// Longer lists scroll, as the clipboard page does.
const PLUGIN_LIST_MAX_ROWS = 8;

/**
 * Height of the expanded island on a plugin page; a list grows with its rows,
 * and a webview page is as tall as its manifest asks (below the same chrome).
 */
export function getPluginPageExpandedHeight(
  template: keyof typeof PLUGIN_PAGE_HEIGHT | null | undefined,
  maxPanelHeight: number,
  listRows?: number | null,
  webviewHeight?: number | null,
) {
  if (template === "webview" && typeof webviewHeight === "number") {
    return Math.min(PLUGIN_LIST_CHROME_HEIGHT + webviewHeight, maxPanelHeight);
  }
  if (template === "list" && typeof listRows === "number") {
    const rows = clamp(listRows, PLUGIN_LIST_MIN_ROWS, PLUGIN_LIST_MAX_ROWS);
    return Math.min(PLUGIN_LIST_CHROME_HEIGHT + rows * PLUGIN_LIST_ROW_PITCH, maxPanelHeight);
  }
  return Math.min(PLUGIN_PAGE_HEIGHT[template ?? "list"], maxPanelHeight);
}
