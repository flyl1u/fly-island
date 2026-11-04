import { messagePanelHeight, type MessageView } from "../../features/messages/Messages";
import type { TodoItem, TodoPageMode } from "../../features/todos/types";
import { BASE_EXPANDED_ISLAND_HEIGHT, CLIPBOARD_EXPANDED_ISLAND_HEIGHT, MUSIC_EXPANDED_ISLAND_HEIGHT, MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT, TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_GROW_START_ROWS, TODO_ROW_HEIGHT, getTodoScrollStartRows, getTodoVisualRows } from "./layout";
import type { IslandPage } from "./types";

type ExpandedHeightInput = {
  page: IslandPage;
  todoPageMode: TodoPageMode;
  todos: TodoItem[];
  musicSettingsOpen: boolean;
  hasMediaCommandError: boolean;
  messageSource: MessageView;
  isReadingMail: boolean;
  maxPanelHeight: number;
};

/**
 * Height of the expanded island for the open page. The todo page grows with its
 * rows, and the pages that scroll (todos, clipboard, messages) stop at the
 * panel height limit; the music and archive layouts keep their fixed heights.
 */
export function getExpandedIslandHeight({
  page,
  todoPageMode,
  todos,
  musicSettingsOpen,
  hasMediaCommandError,
  messageSource,
  isReadingMail,
  maxPanelHeight,
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

  return page === "todo"
    ? isTodoArchivePage
      ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
      : BASE_EXPANDED_ISLAND_HEIGHT +
        Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
    : page === "music"
      ? musicSettingsOpen
        ? MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT
        : MUSIC_EXPANDED_ISLAND_HEIGHT + (hasMediaCommandError ? 24 : 0)
      : page === "clipboard"
        ? Math.min(CLIPBOARD_EXPANDED_ISLAND_HEIGHT, maxPanelHeight)
        : Math.min(messagePanelHeight(messageSource, isReadingMail), maxPanelHeight);
}
