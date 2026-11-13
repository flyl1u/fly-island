import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildChangelog, compareVersionsDescending, inlineParts, parseReleaseNotes } from "../../src/features/updater/changelogParse.ts";

const NOTE = ["## 更新内容", "", "- **待办**：拖动换位", "  - 子项", "  续行", "", "## 下载", "- setup.exe", "", "---", "", "## What's new", "", "- **Todos**: drag", "", "## Downloads", "- setup.exe"].join("\n");

test("release notes yield only the what's-new bullets, nested and joined", () => {
  assert.deepEqual(parseReleaseNotes(NOTE, "zh-CN"), [{ depth: 0, text: "**待办**：拖动换位" }, { depth: 1, text: "子项 续行" }]);
  assert.deepEqual(parseReleaseNotes(NOTE, "en"), [{ depth: 0, text: "**Todos**: drag" }]);
  assert.equal(parseReleaseNotes("## 更新内容\n- 仅中文", "en")[0].text, "仅中文", "English falls back to Chinese");
});

test("versions sort newest first and inline markup keeps bold and code only", () => {
  assert.deepEqual(["0.2.9", "3.0.10", "3.0.2", "0.2.21", "3.1.0-beta.1", "3.1.0"].sort(compareVersionsDescending),
    ["3.1.0", "3.1.0-beta.1", "3.0.10", "3.0.2", "0.2.21", "0.2.9"]);
  assert.deepEqual(inlineParts("**粗** 和 `代码` 与 [链接](https://x)"),
    [{ kind: "strong", value: "粗" }, { kind: "text", value: " 和 " }, { kind: "code", value: "代码" }, { kind: "text", value: " 与 链接" }]);
});

test("every release note in docs/releases has a changelog entry in both languages", () => {
  const files = Object.fromEntries(readdirSync("docs/releases").filter((name) => /^v.+\.md$/.test(name))
    .map((name) => [`docs/releases/${name}`, readFileSync(`docs/releases/${name}`, "utf8")]));
  for (const locale of ["zh-CN", "en"]) {
    const entries = buildChangelog(files, locale);
    assert.equal(entries.length, Object.keys(files).length, `${locale}: one entry per release note`);
    assert.ok(entries.every((entry) => entry.items.length > 0));
  }
});
