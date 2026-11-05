import assert from "node:assert/strict";
import test from "node:test";
import { parseInline, parseMarkdown } from "../../src/components/markdown/parseMarkdown.ts";

test("blocks: headings, paragraphs, lists, quotes, code and rules", () => {
  const blocks = parseMarkdown([
    "# 番茄钟", "", "第一行", "接着一行", "", "- 甲", "- 乙", "  续行", "", "1. 一", "2. 二", "", "> 引用", "", "```", "a <b>", "```", "---",
  ].join("\r\n"));
  assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph", "list", "list", "quote", "code", "rule"]);
  assert.deepEqual(blocks[0], { type: "heading", level: 1, content: [{ type: "text", text: "番茄钟" }] });
  assert.deepEqual(blocks[1], { type: "paragraph", content: [{ type: "text", text: "第一行 接着一行" }] });
  assert.deepEqual(blocks[2], { type: "list", ordered: false, items: [[{ type: "text", text: "甲" }], [{ type: "text", text: "乙 续行" }]] });
  assert.equal(blocks[3].type === "list" && blocks[3].ordered, true);
  assert.deepEqual(blocks[5], { type: "code", text: "a <b>" });
});

test("inline: code, bold, italics and only http(s) links", () => {
  assert.deepEqual(parseInline("按 **Ctrl+Alt+P** 开始，`todos:read` 和 *斜体*"), [
    { type: "text", text: "按 " }, { type: "strong", text: "Ctrl+Alt+P" }, { type: "text", text: " 开始，" },
    { type: "code", text: "todos:read" }, { type: "text", text: " 和 " }, { type: "em", text: "斜体" },
  ]);
  assert.deepEqual(parseInline("见 [文档](https://example.com/a)"), [{ type: "text", text: "见 " }, { type: "link", text: "文档", href: "https://example.com/a" }]);
  assert.deepEqual(parseInline("[x](javascript:alert(1))"), [{ type: "text", text: "x)" }], "a script link keeps only its text");
  assert.deepEqual(parseInline("![图](https://example.com/a.png)"), [{ type: "text", text: "图" }], "images show their alt text");
});

test("HTML stays text", () => {
  assert.deepEqual(parseMarkdown("<script>alert(1)</script>"), [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }]);
});
