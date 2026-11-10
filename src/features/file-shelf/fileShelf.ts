export type FileKind =
  | "folder" | "image" | "video" | "audio" | "archive" | "document" | "sheet" | "slides" | "code" | "app" | "file";

const EXTENSION_KINDS: Record<Exclude<FileKind, "folder" | "file">, string[]> = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "heic", "tif", "tiff", "psd"],
  video: ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv"],
  audio: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "wma"],
  archive: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"],
  document: ["txt", "md", "pdf", "doc", "docx", "rtf", "log", "epub"],
  sheet: ["xls", "xlsx", "csv", "tsv", "numbers"],
  slides: ["ppt", "pptx", "key"],
  code: ["js", "mjs", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "cs", "html", "css", "json", "xml", "yml", "yaml", "toml", "sh", "ps1", "bat", "cmd", "sql"],
  app: ["exe", "msi", "lnk", "appx", "msix"],
};

/** The extension of `name` in lowercase, or null for a folder or a name without one. */
function extensionOf(name: string, isDir: boolean) {
  const dot = name.lastIndexOf(".");
  return isDir || dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1).toLowerCase();
}

/** Picks the icon family (and its colour) for a shelf entry from its name. */
export function getFileKind(name: string, isDir: boolean): FileKind {
  if (isDir) return "folder";
  const extension = extensionOf(name, false);
  if (!extension) return "file";
  const match = (Object.keys(EXTENSION_KINDS) as (keyof typeof EXTENSION_KINDS)[])
    .find((kind) => EXTENSION_KINDS[kind].includes(extension));
  return match ?? "file";
}

/** "PDF", "DOCX": the type shown before the size; null when there is no short extension. */
export function getTypeLabel(name: string, isDir: boolean) {
  const extension = extensionOf(name, isDir);
  return extension && extension.length <= 5 ? extension.toUpperCase() : null;
}

/**
 * A name cut where it may be shortened: the stem truncates, the extension (".docx") stays, so a
 * long name still says what kind of file it is. Folders and names without a short extension
 * keep everything in the stem.
 */
export function splitFileName(name: string, isDir: boolean) {
  const extension = extensionOf(name, isDir);
  if (!extension || extension.length > 5) return { stem: name, extension: "" };
  return { stem: name.slice(0, name.length - extension.length - 1), extension: `.${extension}` };
}

/**
 * The stem to show so that it and the extension fit `maxWidth`: all of it when it fits, else its
 * start and end around an ellipsis ("IMG_2026…3522"), as Finder shortens names: screenshots and
 * versions often differ only at the end. `measure` gives a text's width in the same units.
 */
export function fitFileStem(stem: string, extension: string, maxWidth: number, measure: (text: string) => number) {
  if (measure(stem + extension) <= maxWidth) return stem;
  const chars = Array.from(stem);
  const shorten = (kept: number) => {
    const head = Math.ceil(kept * 0.6);
    return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - (kept - head)).join("")}`;
  };
  let low = 0;
  let high = chars.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(shorten(middle) + extension) <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return shorten(low);
}

/** Up to this many entries sit as large tiles in one row; more switch to compact rows. */
export const SHELF_TILE_LIMIT = 4;

/** How the shelf lays out `count` entries: nothing, one row of tiles, or two columns of rows. */
export function getShelfLayout(count: number): "empty" | "tiles" | "rows" {
  if (count <= 0) return "empty";
  return count <= SHELF_TILE_LIMIT ? "tiles" : "rows";
}

/** Same rule as path_key in src-tauri/src/file_shelf/store.rs: case and slash style do not matter. */
export function pathKey(path: string) {
  return path.replace(/\//g, "\\").toLowerCase();
}

/**
 * Which shelf entries a drop of `paths` produced, and whether every one of them was
 * already on the shelf before (`before`), so the drop only moved them to the top.
 */
export function getDropResult(
  paths: string[],
  before: { path: string }[],
  after: { id: string; path: string }[],
) {
  const dropped = new Set(paths.map(pathKey));
  const existing = new Set(before.map((item) => pathKey(item.path)));
  const ids = after.filter((item) => dropped.has(pathKey(item.path))).map((item) => item.id);
  const allExisting = ids.length > 0 && after
    .filter((item) => dropped.has(pathKey(item.path)))
    .every((item) => existing.has(pathKey(item.path)));
  return { ids, allExisting };
}

const SIZE_UNITS =["B", "KB", "MB", "GB", "TB"];

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
