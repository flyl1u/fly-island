// 与 src-tauri/src/clipboard_history.rs 中的同名结构对应。
export type ClipboardHistorySettings = {
  enabled: boolean;
  captureImages: boolean;
  maxItems: number;
  shortcut: string;
  shortcutEnabled: boolean;
};

export type ClipboardHistoryImage = {
  width: number;
  height: number;
  byteSize: number;
  originalPath: string;
  thumbnailPath: string;
  thumbnailDataUrl?: string;
};

export type ClipboardHistoryItem = {
  id: string;
  kind: "text" | "image";
  hash: string;
  createdAt: number;
  copiedAt: number;
  favorite?: boolean;
  note?: string;
  preview: string;
  text?: string;
  image?: ClipboardHistoryImage;
};

export type ClipboardHistorySnapshot = {
  settings: ClipboardHistorySettings;
  items: ClipboardHistoryItem[];
};
