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
