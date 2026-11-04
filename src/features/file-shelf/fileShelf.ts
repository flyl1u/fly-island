export type FileKind = "folder" | "image" | "video" | "audio" | "archive" | "text" | "file";

const EXTENSION_KINDS: Record<Exclude<FileKind, "folder" | "file">, string[]> = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "heic", "tif", "tiff"],
  video: ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv"],
  audio: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "wma"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"],
  text: ["txt", "md", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "json", "log", "rtf"],
};

/** Picks the icon family for a shelf entry from its name. */
export function getFileKind(name: string, isDir: boolean): FileKind {
  if (isDir) return "folder";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "file";
  const extension = name.slice(dot + 1).toLowerCase();
  const match = (Object.keys(EXTENSION_KINDS) as (keyof typeof EXTENSION_KINDS)[])
    .find((kind) => EXTENSION_KINDS[kind].includes(extension));
  return match ?? "file";
}

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

/** "820 B", "1.4 MB", "12 GB": one decimal below 10, none above. */
export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${SIZE_UNITS[unit]}`;
}
