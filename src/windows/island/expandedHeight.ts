import { messagePanelHeight, type MessageView } from "../../features/messages/Messages";
import { TODO_SCROLL_START_ROWS } from "../../features/todos/layout";
import type { TodoItem, TodoPageMode } from "../../features/todos/types";
import { BASE_EXPANDED_ISLAND_HEIGHT, CLIPBOARD_EXPANDED_ISLAND_HEIGHT, MUSIC_EXPANDED_ISLAND_HEIGHT, MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT, TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT, TODO_GROW_START_ROWS, TODO_ROW_HEIGHT, getTodoVisualRows } from "./layout";
import type { IslandPage } from "./types";

type ExpandedHeightInput = {
  page: IslandPage;
  todoPageMode: TodoPageMode;
  todos: TodoItem[];
  musicSettingsOpen: boolean;
  hasMediaCommandError: boolean;
  messageSource: MessageView;
  isReadingMail: boolean;
};

/** Height of the expanded island for the open page; the todo page grows with its rows up to a scroll limit. */
export function getExpandedIslandHeight({
  page,
  todoPageMode,
  todos,
  musicSettingsOpen,
  hasMediaCommandError,
  messageSource,
  isReadingMail,
}: ExpandedHeightInput) {
  const isTodoArchivePage =
    page === "todo" && (todoPageMode === "archive" || todoPageMode === "review");
  const visibleTodoRows = Math.min(
    Math.max(
      todoPageMode === "daily" || isTodoArchivePage
        ? TODO_GROW_START_ROWS
        : getTodoVisualRows(todos),
      1,
    ),
    TODO_SCROLL_START_ROWS,
  );

  return page === "settings" ? 480 : page === "todo"
    ? isTodoArchivePage
      ? TODO_ARCHIVE_EXPANDED_ISLAND_HEIGHT
      : BASE_EXPANDED_ISLAND_HEIGHT +
        Math.max(0, visibleTodoRows - TODO_GROW_START_ROWS) * TODO_ROW_HEIGHT
    : page === "music"
      ? musicSettingsOpen
        ? MUSIC_SETTINGS_EXPANDED_ISLAND_HEIGHT
        : MUSIC_EXPANDED_ISLAND_HEIGHT + (hasMediaCommandError ? 24 : 0)
      : page === "clipboard"
        ? CLIPBOARD_EXPANDED_ISLAND_HEIGHT
        : messagePanelHeight(messageSource, isReadingMail);
}
