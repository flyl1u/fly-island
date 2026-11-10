import { messagePanelHeight, type MessageView } from "../../features/messages/Messages";
import type { TodoItem, TodoPageMode } from "../../features/todos/types";
import { BASE_EXPANDED_ISLAND_HEIGHT, MUSIC_EXPANDED_ISLAND_HEIGHT, TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_GROW_START_ROWS, TODO_ROW_HEIGHT, getAgentAlertExpandedHeight, getAgentPageExpandedHeight, getClipboardExpandedHeight, getTodoScrollStartRows, getTodoVisualRows } from "./layout";
import type { AgentSessionView } from "../../features/appearance/types";
import { getShelfLayout } from "../../features/file-shelf/fileShelf";
import type { IslandPage } from "./types";

// The shelf page fits what it holds (FileShelfPanel.css, FileShelfItem.css): the island's padding,
// header and gap (86) around the panel's padding and title line (66); then one 118px row of tiles
// for up to four files, or rows of 44px 6px apart in two columns, five rows at most before it
// scrolls; and the hint line under them (26). Empty, the 118px tray and no hint. Keep in step.
const SHELF_ISLAND_CHROME = 86;
const SHELF_PANEL_CHROME = 66;
const SHELF_TILE_ROW = 118;
const SHELF_ROW_PITCH = 50;
const SHELF_MAX_ROWS = 5;
const SHELF_HINT = 26;

/** The island's height around the shelf page holding `items` entries. */
export function getShelfExpandedHeight(items: number) {
  const layout = getShelfLayout(items);
  const list = layout === "rows"
    ? Math.min(SHELF_MAX_ROWS, Math.ceil(items / 2)) * SHELF_ROW_PITCH - 6
    : SHELF_TILE_ROW;
  return SHELF_ISLAND_CHROME + SHELF_PANEL_CHROME + list + (layout === "empty" ? 0 : SHELF_HINT);
}
// Header, direction bar, a few lines of source, the result and the action row.
const TRANSLATION_EXPANDED_ISLAND_HEIGHT = 420;
// Settings fit their open page (useSettingsPageHeight): the island's padding, header and gap
// around it, between a floor that keeps short pages from looking cramped and about the tallest
// island the window allows, past which the page scrolls. The fallback before the first measure.
const SETTINGS_CHROME_HEIGHT = 86;
const MIN_SETTINGS_EXPANDED_ISLAND_HEIGHT = 340;
const MAX_SETTINGS_EXPANDED_ISLAND_HEIGHT = 560;
const DEFAULT_SETTINGS_EXPANDED_ISLAND_HEIGHT = 440;

/** The island's height around a settings page whose content measured `contentHeight` (null: not yet). */
export function getSettingsExpandedHeight(contentHeight: number | null) {
  if (contentHeight === null) return DEFAULT_SETTINGS_EXPANDED_ISLAND_HEIGHT;
  return Math.min(MAX_SETTINGS_EXPANDED_ISLAND_HEIGHT, Math.max(MIN_SETTINGS_EXPANDED_ISLAND_HEIGHT, contentHeight + SETTINGS_CHROME_HEIGHT));
}

type ExpandedHeightInput = {
  page: IslandPage;
  todoPageMode: TodoPageMode;
  todos: TodoItem[];
  hasMediaCommandError: boolean;
  messageSource: MessageView;
  isReadingMail: boolean;
  maxPanelHeight: number;
  clipboardVisibleRows: number;
  agentVisibleRows: number;
  /** How the Agent page shows sessions (Settings); each view has its own row height. */
  agentSessionView?: AgentSessionView;
  /** How many usage lines (Claude, Codex) sit above the Agent page's rows. */
  agentUsageLines: number;
  /** An alert's one-session card instead: the height its row measured, without the usage line. */
  agentAlertRowHeight?: number;
  /** The height the open settings page needs, or null before it is measured. */
  settingsContentHeight?: number | null;
  /** Entries on the file shelf; its page fits their rows of tiles. */
  shelfItems?: number;
};

/**
 * Height of the expanded island for the open page. The todo page grows with its
 * rows, and the todo, shelf and message pages stop at the panel height limit;
 * the clipboard and Agent pages show the row counts set for them, and the music and archive
 * layouts keep their fixed heights.
 */
export function getExpandedIslandHeight({
  page,
  todoPageMode,
  todos,
  hasMediaCommandError,
  messageSource,
  isReadingMail,
  maxPanelHeight,
  clipboardVisibleRows,
  agentVisibleRows,
  agentSessionView = "list",
  agentUsageLines,
  agentAlertRowHeight,
  settingsContentHeight = null,
  shelfItems = 0,
}: ExpandedHeightInput) {
  // The upcoming list scrolls inside the archive's fixed height.
  const isTodoArchivePage =
    page === "todo" &&
    (todoPageMode === "archive" || todoPageMode === "review" || todoPageMode === "upcoming");
  const visibleTodoRows = Math.min(
    Math.max(
      todoPageMode === "daily" || isTodoArchivePage
        ? TODO_GROW_START_ROWS
        : getTodoVisualRows(todos),
      1,
    ),
    getTodoScrollStartRows(maxPanelHeight),
  );

  return page === "settings"
    ? getSettingsExpandedHeight(settingsContentHeight)
    : page === "todo"
    ? isTodoArchivePage
      ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
      : BASE_EXPANDED_ISLAND_HEIGHT +
        Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
    : page === "music"
      ? MUSIC_EXPANDED_ISLAND_HEIGHT + (hasMediaCommandError ? 24 : 0)
      : page === "shelf"
        ? Math.min(getShelfExpandedHeight(shelfItems), maxPanelHeight)
      : page === "translation"
        ? Math.min(TRANSLATION_EXPANDED_ISLAND_HEIGHT, maxPanelHeight)
      : page === "agents"
        ? agentAlertRowHeight !== undefined
          ? getAgentAlertExpandedHeight(agentAlertRowHeight)
          : getAgentPageExpandedHeight(agentVisibleRows, agentUsageLines, agentSessionView)
      : page === "clipboard"
        ? getClipboardExpandedHeight(clipboardVisibleRows)
        : Math.min(messagePanelHeight(messageSource, isReadingMail), maxPanelHeight);
}
