import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

// 与 src-tauri/src/file_shelf/mod.rs 中的 FileShelfItem / FileShelfEntry 对应。
export type FileShelfItem = {
  id: string;
  path: string;
  name: string;
  isDir: boolean;
  /** Bytes for a file; 0 for a folder. */
  size: number;
  addedAt: number;
  /** The original was moved, renamed or deleted since it was added. */
  missing: boolean;
};

// 与 src-tauri/src/file_shelf/mod.rs 中的 FileShelfSnapshot 对应。
export type FileShelfSnapshot = {
  items: FileShelfItem[];
};

// 与 src-tauri/src/file_shelf/store.rs 中的 FileShelfOptions 对应。
export type FileShelfOptions = {
  maxItems: number;
  /** Entries added more than this many days ago leave the list; 0 keeps them. */
  maxAgeDays: number;
  removeMissing: boolean;
};

export function getFileShelf() {
  return invoke<FileShelfSnapshot>("get_file_shelf");
}

/** Hands the cleanup options to the shelf, which applies them at once. */
export function setFileShelfOptions(options: FileShelfOptions) {
  return invoke<FileShelfSnapshot>("set_file_shelf_options", { options });
}

export function addFileShelfPaths(paths: string[]) {
  return invoke<FileShelfSnapshot>("add_file_shelf_paths", { paths });
}

export function removeFileShelfItem(id: string) {
  return invoke<FileShelfSnapshot>("remove_file_shelf_item", { id });
}

export function clearFileShelf() {
  return invoke<FileShelfSnapshot>("clear_file_shelf");
}

/** Puts the files on the clipboard as Explorer's Copy does. */
export function copyFileShelfItems(ids: string[]) {
  return invoke<void>("copy_file_shelf_items", { ids });
}

export function openFileShelfItem(id: string) {
  return invoke<void>("open_file_shelf_item", { id });
}

export function revealFileShelfItem(id: string) {
  return invoke<void>("reveal_file_shelf_item", { id });
}

/**
 * Starts a native drag while the button is held; resolves when it ends. With
 * `removeAfter`, entries a target accepted leave the shelf.
 */
export function startFileShelfDrag(ids: string[], removeAfter: boolean) {
  return invoke<FileShelfSnapshot>("start_file_shelf_drag", { ids, removeAfter });
}

export type FileDropEvent =
  | { type: "enter"; paths: string[] }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };

/** Files dragged over and dropped on the island window. 调用方负责在卸载时取消。 */
export function listenFileDrop(handler: (event: FileDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "enter" || payload.type === "drop") {
      handler({ type: payload.type, paths: payload.paths });
    } else if (payload.type === "leave") {
      handler({ type: "leave" });
    }
  });
}
