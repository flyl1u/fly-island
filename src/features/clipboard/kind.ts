import type { ClipboardHistoryItem } from "./api";

/** What a history row holds, for the type filter; image captures may also retain `files`. */
export type ClipboardItemKind = "text" | "image" | "file";
export type ClipboardKindFilter = ClipboardItemKind | "any";

export function clipboardItemKind(item: Pick<ClipboardHistoryItem, "kind" | "files">): ClipboardItemKind {
  // Image captures can retain source files for copy-back; the image kind wins over that metadata.
  if (item.kind === "image") return "image";
  const hasFiles = item.files !== undefined && item.files.length > 0;
  return hasFiles ? "file" : "text";
}

export function matchesKind(item: Pick<ClipboardHistoryItem, "kind" | "files">, filter: ClipboardKindFilter) {
  return filter === "any" || clipboardItemKind(item) === filter;
}
