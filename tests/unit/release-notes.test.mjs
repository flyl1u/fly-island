import assert from "node:assert/strict";
import test from "node:test";
import { releaseNoteLines } from "../../src/features/updater/releaseNotes.ts";

const NOTES = `## 更新内容

- **插件**：新增插件市场，见 [文档](https://example.com)。
- 设置 \`todos.json\`

## 安装包

- \`fly-island_0.3.0_x64-setup.exe\`：安装包。

---

## What's New

- **Plugins**: a plugin market.

## Downloads

- \`setup.exe\`: installer.
`;

test("release notes keep the half in the interface language", () => {
  assert.deepEqual(releaseNoteLines(NOTES, "zh-CN"), [
    { kind: "heading", text: "更新内容" },
    { kind: "item", text: "插件：新增插件市场，见 文档。" },
    { kind: "item", text: "设置 todos.json" },
  ]);
  assert.deepEqual(releaseNoteLines(NOTES, "en"), [
    { kind: "heading", text: "What's New" },
    { kind: "item", text: "Plugins: a plugin market." },
  ]);
});

test("single-language notes are shown in every locale", () => {
  const notes = "Fixed a crash.\r\n\r\n- Faster start";
  const expected = [
    { kind: "text", text: "Fixed a crash." },
    { kind: "item", text: "Faster start" },
  ];
  assert.deepEqual(releaseNoteLines(notes, "en"), expected);
  assert.deepEqual(releaseNoteLines(notes, "zh-CN"), expected);
});
