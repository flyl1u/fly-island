import assert from "node:assert/strict";
import test from "node:test";
import { formatFileSize, getFileKind, getTypeLabel } from "../../src/features/file-shelf/fileShelf.ts";

test("shelf icons follow the file extension, case-insensitively", () => {
  assert.equal(getFileKind("Photos", true), "folder");
  assert.equal(getFileKind("shot.PNG", false), "image");
  assert.equal(getFileKind("clip.mp4", false), "video");
  assert.equal(getFileKind("song.flac", false), "audio");
  assert.equal(getFileKind("backup.7z", false), "archive");
  assert.equal(getFileKind("report.docx", false), "document");
  assert.equal(getFileKind("budget.xlsx", false), "sheet");
  assert.equal(getFileKind("deck.PPTX", false), "slides");
  assert.equal(getFileKind("main.rs", false), "code");
  assert.equal(getFileKind("setup.exe", false), "app");
  assert.equal(getFileKind("odd.", false), "file");
  assert.equal(getTypeLabel("report.pdf", false), "PDF");
  assert.equal(getTypeLabel("Photos.2024", true), null);
  assert.equal(getTypeLabel("Makefile", false), null);
  assert.equal(getTypeLabel("archive.longext", false), null);
  assert.equal(getFileKind("Makefile", false), "file");
  assert.equal(getFileKind(".gitignore", false), "file");
});

test("file sizes use binary units with one decimal below ten", () => {
  assert.equal(formatFileSize(0), "0 B");
  assert.equal(formatFileSize(-5), "0 B");
  assert.equal(formatFileSize(820), "820 B");
  assert.equal(formatFileSize(1_536), "1.5 KB");
  assert.equal(formatFileSize(15 * 1024 * 1024), "15 MB");
  assert.equal(formatFileSize(3 * 1024 ** 3), "3.0 GB");
  assert.equal(formatFileSize(Number.NaN), "0 B");
});

test("a drop reports the entries it added and whether they were all on the shelf already", async () => {
  const { getDropResult } = await import("../../src/features/file-shelf/fileShelf.ts");
  const before = [{ path: String.raw`C:\a.txt` }];
  const after = [
    { id: "2", path: String.raw`C:\b.txt` },
    { id: "1", path: String.raw`C:\a.txt` },
  ];
  assert.deepEqual(getDropResult(["C:/B.TXT"], before, after), { ids: ["2"], allExisting: false });
  assert.deepEqual(getDropResult([String.raw`c:\A.txt`], before, after), { ids: ["1"], allExisting: true });
  assert.deepEqual(getDropResult([String.raw`C:\a.txt`, String.raw`C:\b.txt`], before, after), { ids: ["2", "1"], allExisting: false });
  // Paths the shelf refused (missing or relative) add nothing.
  assert.deepEqual(getDropResult(["relative.txt"], before, after), { ids: [], allExisting: false });
});

test("clicks select entries like Explorer: plain, Ctrl-toggle and Shift-range", async () => {
  const { EMPTY_SELECTION, selectEntry, keepVisible, targetIds } = await import("../../src/features/file-shelf/selection.ts");
  const visible = ["a", "b", "c", "d"];
  let selection = selectEntry(EMPTY_SELECTION, visible, "b", "single");
  assert.deepEqual(selection, { ids: ["b"], anchor: "b" });
  selection = selectEntry(selection, visible, "d", "range");
  assert.deepEqual(selection.ids, ["b", "c", "d"]);
  selection = selectEntry(selection, visible, "a", "toggle");
  assert.deepEqual(selection.ids, ["a", "b", "c", "d"]);
  selection = selectEntry(selection, visible, "c", "toggle");
  assert.deepEqual(selection.ids, ["a", "b", "d"]);
  assert.deepEqual(targetIds(selection, "b"), ["a", "b", "d"]);
  assert.deepEqual(targetIds(selection, "c"), ["c"]);
  // The last Ctrl-click (c) stays the anchor while it is visible.
  assert.deepEqual(keepVisible(selection, ["b", "c"]), { ids: ["b"], anchor: "c" });
  assert.deepEqual(keepVisible(selection, ["b"]), { ids: ["b"], anchor: null });
  assert.equal(keepVisible(selection, visible), selection);
});

test("the shelf search matches name or path, ignoring case and slash style", async () => {
  const { filterShelfItems } = await import("../../src/features/file-shelf/selection.ts");
  const items = [
    { name: "Report.docx", path: String.raw`D:\Work\Report.docx` },
    { name: "photo.png", path: String.raw`C:\Users\me\Pictures\photo.png` },
  ];
  assert.deepEqual(filterShelfItems(items, "  "), items);
  assert.deepEqual(filterShelfItems(items, "report").map((item) => item.name), ["Report.docx"]);
  assert.deepEqual(filterShelfItems(items, "users/ME").map((item) => item.name), ["photo.png"]);
  assert.deepEqual(filterShelfItems(items, "zzz"), []);
});

test("long names truncate in the stem and keep a short extension", async () => {
  const { splitFileName } = await import("../../src/features/file-shelf/fileShelf.ts");
  assert.deepEqual(splitFileName("季度报告.pdf", false), { stem: "季度报告", extension: ".pdf" });
  assert.deepEqual(splitFileName("archive.tar.gz", false), { stem: "archive.tar", extension: ".gz" });
  assert.deepEqual(splitFileName("Photos.2024", true), { stem: "Photos.2024", extension: "" });
  assert.deepEqual(splitFileName("Makefile", false), { stem: "Makefile", extension: "" });
  assert.deepEqual(splitFileName(".gitignore", false), { stem: ".gitignore", extension: "" });
  assert.deepEqual(splitFileName("data.verylongext", false), { stem: "data.verylongext", extension: "" });
});

test("up to four entries sit as tiles, more as compact rows", async () => {
  const { getShelfLayout } = await import("../../src/features/file-shelf/fileShelf.ts");
  assert.equal(getShelfLayout(0), "empty");
  assert.equal(getShelfLayout(1), "tiles");
  assert.equal(getShelfLayout(4), "tiles");
  assert.equal(getShelfLayout(5), "rows");
  assert.equal(getShelfLayout(12), "rows");
});

test("a long stem keeps its start and end around an ellipsis, with the extension whole", async () => {
  const { fitFileStem } = await import("../../src/features/file-shelf/fileShelf.ts");
  const measure = (text) => text.length * 10;
  assert.equal(fitFileStem("short", ".pdf", 200, measure), "short");
  const fitted = fitFileStem("IMG_20261108_183522", ".jpg", 140, measure);
  assert.ok(measure(fitted + ".jpg") <= 140);
  assert.match(fitted, /^IMG_2.*….*522$/);
  // Chinese names are cut by character, never inside one.
  const chinese = fitFileStem("第三季度经营分析报告终版", ".pdf", 120, measure);
  assert.ok(chinese.includes("…") && chinese.startsWith("第") && measure(chinese + ".pdf") <= 120);
  // With almost no room, only the ellipsis is left.
  assert.equal(fitFileStem("abcdef", ".txt", 10, measure), "…");
});
