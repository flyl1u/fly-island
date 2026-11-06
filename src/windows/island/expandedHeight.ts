import { messagePanelHeight, type MessageView } from "../../features/messages/Messages";
import type { TodoItem, TodoPageMode } from "../../features/todos/types";
import { BASE_EXPANDED_ISLAND_HEIGHT, MUSIC_EXPANDED_ISLAND_HEIGHT, TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_GROW_START_ROWS, TODO_ROW_HEIGHT, getAgentAlertExpandedHeight, getAgentPageExpandedHeight, getClipboardExpandedHeight, getPluginPageExpandedHeight, getTodoScrollStartRows, getTodoVisualRows } from "./layout";
import type { PluginViewTemplate } from "../../features/plugin-views/api";
import { isPluginPage } from "./features";
import type { IslandPage } from "./types";

// Tall enough for about four shelf rows before the list scrolls.
const SHELF_EXPANDED_ISLAND_HEIGHT = 430;
// Header, direction bar, a few lines of source, the result and the action row.
const TRANSLATION_EXPANDED_ISLAND_HEIGHT = 420;

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
  /** The usage line sits above the Agent page's rows. */
  agentShowUsage: boolean;
  /** An alert's one-session card instead: the height its row measured, without the usage line. */
  agentAlertRowHeight?: number;
  /** The template of the open plugin page; null when it is not known (yet). */
  pluginTemplate?: PluginViewTemplate | null;
  /** Rows the open plugin list shows (items, group titles, search box). */
  pluginListRows?: number | null;
  /** The height the open webview plugin page asks for. */
  pluginWebviewHeight?: number | null;
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
  agentShowUsage,
  agentAlertRowHeight,
  pluginTemplate,
  pluginListRows,
  pluginWebviewHeight,
}: ExpandedHeightInput) {
  if (isPluginPage(page)) {
    return getPluginPageExpandedHeight(pluginTemplate, maxPanelHeight, pluginListRows, pluginWebviewHeight);
  }
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

  return page === "todo"
    ? isTodoArchivePage
      ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
      : BASE_EXPANDED_ISLAND_HEIGHT +
        Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
    : page === "music"
      ? MUSIC_EXPANDED_ISLAND_HEIGHT + (hasMediaCommandError ? 24 : 0)
      : page === "shelf"
        ? Math.min(SHELF_EXPANDED_ISLAND_HEIGHT, maxPanelHeight)
      : page === "translation"
        ? Math.min(TRANSLATION_EXPANDED_ISLAND_HEIGHT, maxPanelHeight)
      : page === "agents"
        ? agentAlertRowHeight !== undefined
          ? getAgentAlertExpandedHeight(agentAlertRowHeight)
          : getAgentPageExpandedHeight(agentVisibleRows, agentShowUsage)
      : page === "clipboard"
        ? getClipboardExpandedHeight(clipboardVisibleRows)
        : Math.min(messagePanelHeight(messageSource, isReadingMail), maxPanelHeight);
}
