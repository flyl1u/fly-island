import { messagePanelHeight, type MessageView } from "../../features/messages/Messages";
import type { TodoItem, TodoPageMode } from "../../features/todos/types";
import { BASE_EXPANDED_ISLAND_HEIGHT, DAILY_NOTE_EXPANDED_ISLAND_HEIGHT, MUSIC_EXPANDED_ISLAND_HEIGHT, TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_CALENDAR_EXPANDED_ISLAND_HEIGHT, TODO_GROW_START_ROWS, TODO_ROW_HEIGHT, getAgentAlertExpandedHeight, getAgentPageExpandedHeight, getClipboardExpandedHeight, getTodoScrollStartRows, getTodoVisualRows } from "./layout";
import type { AgentSessionView } from "../../features/appearance/types";
import { getShelfLayout } from "../../features/file-shelf/fileShelf";
import type { IslandPage } from "./types";

// The shelf page fits what it holds (FileShelfPanel.css, FileShelfItem.css, FileShelfBar.css):
// the island's padding, header and gap (86) around the panel's padding (22); then one 118px row
// of tiles for up to four files, or rows of 44px 6px apart in two columns, five rows at most
// before it scrolls, with the 8px gap and 28px line under the rows (one row of tiles has no line:
// Clear floats in the panel's corner). Empty, a 136px space for the fanned files and their two
// lines. Keep in step.
const SHELF_ISLAND_CHROME = 86;
const SHELF_PANEL_PADDING = 22;
const SHELF_TILE_ROW = 118;
const SHELF_ROW_PITCH = 50;
const SHELF_MAX_ROWS = 5;
const SHELF_BAR = 36;
const SHELF_EMPTY = 136;

/** The island's height around the shelf page holding `items` entries. */
export function getShelfExpandedHeight(items: number) {
  const layout = getShelfLayout(items);
  const content = layout === "empty"
    ? SHELF_EMPTY
    : layout === "rows" ? Math.min(SHELF_MAX_ROWS, Math.ceil(items / 2)) * SHELF_ROW_PITCH - 6 + SHELF_BAR : SHELF_TILE_ROW;
  return SHELF_ISLAND_CHROME + SHELF_PANEL_PADDING + content;
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

// A plugin's page (PluginPanel.css): the island's padding, header and gap (86) around the
// panel's padding (34, plus 10 after the head); its headline and note (39), 58px per row 6px
// apart, and the action row (28) with the 10px gap above it. An empty page keeps room for its
// line. Keep in step with the stylesheet.
const PLUGIN_ISLAND_CHROME = 86;
const PLUGIN_PANEL_PADDING = 34;
const PLUGIN_HEAD = 39;
const PLUGIN_GAP = 10;
const PLUGIN_ROW = 58;
const PLUGIN_ROW_GAP = 6;
const PLUGIN_ACTIONS = 28;
const PLUGIN_EMPTY = 120;

/** The island's height around a plugin page showing `rows` entries and its buttons. */
export function getPluginExpandedHeight(rows: number, actions: number) {
  const list = rows > 0 ? rows * PLUGIN_ROW + (rows - 1) * PLUGIN_ROW_GAP : PLUGIN_EMPTY;
  const actionRow = actions > 0 ? PLUGIN_GAP + PLUGIN_ACTIONS : 0;
  return PLUGIN_ISLAND_CHROME + PLUGIN_PANEL_PADDING + PLUGIN_HEAD + PLUGIN_GAP + list + actionRow;
}

type ExpandedHeightInput = {
  page: IslandPage;
  todoPageMode: TodoPageMode;
  todos: TodoItem[];
  /** Actual row heights, including the inline duration picker and time-up actions. */
  todoListHeight?: number | null;
  hasMediaCommandError: boolean;
  messageSource: MessageView;
  isReadingMail: boolean;
  maxPanelHeight: number;
  clipboardVisibleRows: number;
  /** Rows the todo list shows before it scrolls (Settings → Todos). */
  todoVisibleRows?: number;
  agentVisibleRows: number;
  /** How the Agent page shows sessions (Settings); each view has its own row height. */
  agentSessionView?: AgentSessionView;
  fontScale?: number;
  /** How many usage lines (Claude, Codex) sit above the Agent page's rows. */
  agentUsageLines: number;
  /** An alert's one-session card instead: the height its row measured, without the usage line. */
  agentAlertRowHeight?: number;
  /** The height the open settings page needs, or null before it is measured. */
  settingsContentHeight?: number | null;
  /** Entries on the file shelf; its page fits their rows of tiles. */
  shelfItems?: number;
  /** The open plugin page's entries and buttons; its page fits them. */
  pluginPanel?: { rows: number; actions: number };
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
  todoListHeight = null,
  hasMediaCommandError,
  messageSource,
  isReadingMail,
  maxPanelHeight,
  clipboardVisibleRows,
  todoVisibleRows = 8,
  agentVisibleRows,
  agentSessionView = "list",
  fontScale = 1,
  agentUsageLines,
  agentAlertRowHeight,
  settingsContentHeight = null,
  shelfItems = 0,
  pluginPanel,
}: ExpandedHeightInput) {
  // The upcoming list and calendar each scroll inside their fixed height.
  const isTodoArchivePage =
    page === "todo" &&
    todoPageMode === "upcoming";
  const visibleTodoRows = Math.min(
    Math.max(
      todoPageMode === "daily" || isTodoArchivePage || todoPageMode === "calendar"
        ? TODO_GROW_START_ROWS
        : getTodoVisualRows(todos),
      1,
    ),
    getTodoScrollStartRows(maxPanelHeight),
    todoVisibleRows,
  );
  // The tallest the plain todo list grows: its visible rows, within the panel height limit.
  const todoListMax = Math.min(maxPanelHeight, BASE_EXPANDED_ISLAND_HEIGHT + Math.max(0, todoVisibleRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT);

  return page === "settings"
    ? getSettingsExpandedHeight(settingsContentHeight)
    : page === "todo"
    ? todoPageMode === "calendar"
      ? Math.min(TODO_CALENDAR_EXPANDED_ISLAND_HEIGHT, maxPanelHeight)
      : isTodoArchivePage
      ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
      : todoPageMode === "daily"
        ? DAILY_NOTE_EXPANDED_ISLAND_HEIGHT
      : Math.min(todoListMax, BASE_EXPANDED_ISLAND_HEIGHT + (todoListHeight === null
        ? Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
        : Math.max(0, todoListHeight - (TODO_GROW_START_ROWS * TODO_ROW_HEIGHT - 6))))
    : page === "music"
      ? MUSIC_EXPANDED_ISLAND_HEIGHT + (hasMediaCommandError ? 24 : 0)
      : page === "shelf"
        ? Math.min(getShelfExpandedHeight(shelfItems), maxPanelHeight)
      : page === "translation"
        ? Math.min(TRANSLATION_EXPANDED_ISLAND_HEIGHT, maxPanelHeight)
      : page === "agents"
        ? agentAlertRowHeight !== undefined
          ? getAgentAlertExpandedHeight(agentAlertRowHeight)
          : getAgentPageExpandedHeight(agentVisibleRows, agentUsageLines, agentSessionView, fontScale)
      : page === "clipboard"
        ? getClipboardExpandedHeight(clipboardVisibleRows)
        : page === "plugin:device-battery" ? Math.min(420, maxPanelHeight)
        : page.startsWith("plugin:")
          ? Math.min(getPluginExpandedHeight(pluginPanel?.rows ?? 0, pluginPanel?.actions ?? 0), maxPanelHeight)
          : Math.min(messagePanelHeight(messageSource, isReadingMail), maxPanelHeight);
}
