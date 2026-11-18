import type { ClipboardHistoryItem } from "./api";

/** What a history row holds, for the type filter: files copied in Explorer are text items with `files`. */
export type ClipboardItemKind = "text" | "image" | "file";
export type ClipboardKindFilter = ClipboardItemKind | "any";

export function clipboardItemKind(item: Pick<ClipboardHistoryItem, "kind" | "files">): ClipboardItemKind {
  if (item.kind === "image") return "image";
  return item.files && item.files.length > 0 ? "file" : "text";
}

export function matchesKind(item: Pick<ClipboardHistoryItem, "kind" | "files">, filter: ClipboardKindFilter) {
  return filter === "any" || clipboardItemKind(item) === filter;
}
