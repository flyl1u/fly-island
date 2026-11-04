import assert from "node:assert/strict";
import test from "node:test";
import { formatFileSize, getFileKind } from "../src/features/file-shelf/fileShelf.ts";

test("shelf icons follow the file extension, case-insensitively", () => {
  assert.equal(getFileKind("Photos", true), "folder");
  assert.equal(getFileKind("shot.PNG", false), "image");
  assert.equal(getFileKind("clip.mp4", false), "video");
  assert.equal(getFileKind("song.flac", false), "audio");
  assert.equal(getFileKind("backup.7z", false), "archive");
  assert.equal(getFileKind("report.docx", false), "text");
  assert.equal(getFileKind("setup.exe", false), "file");
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
  const { getDropResult } = await import("../src/features/file-shelf/fileShelf.ts");
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
