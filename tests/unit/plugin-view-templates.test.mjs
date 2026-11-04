import assert from "node:assert/strict";
import test from "node:test";
import { restrictedMarkdownToHtml } from "../../src/features/plugin-views/restrictedMarkdown.ts";
import { formValues, normalizeDetailModel, normalizeFormModel, normalizeStatusModel } from "../../src/features/plugin-views/templateModels.ts";

test("restricted markdown makes headings, lists, marks and https links", () => {
  assert.equal(
    restrictedMarkdownToHtml("# Title\nSome **bold**, *italic* and `code`.\nNext line\n\n- one\n- [two](https://example.com/x)\n\n1. first\n2. second"),
    "<h3>Title</h3><p>Some <strong>bold</strong>, <em>italic</em> and <code>code</code>.<br>Next line</p>" +
      '<ul><li>one</li><li><a href="https://example.com/x">two</a></li></ul><ol><li>first</li><li>second</li></ol>',
  );
  assert.equal(restrictedMarkdownToHtml("`**not bold**`"), "<p><code>**not bold**</code></p>");
  assert.equal(restrictedMarkdownToHtml("snake_case_name stays"), "<p>snake_case_name stays</p>");
});

test("restricted markdown never lets markup or other links through", () => {
  const html = restrictedMarkdownToHtml(
    '<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[click](javascript:alert(1))\n[web](http://example.com)\n[q](https://x.com/"onmouseover="alert(1))\n<a href="https://evil">x</a>',
  );
  assert.equal(/<(script|img|iframe)/i.test(html), false);
  assert.equal(html.includes("javascript:"), false, "the label is kept, the link dropped");
  assert.ok(html.includes("click") && html.includes("web"));
  // Only the https link is a link, and its quote stays escaped inside the attribute.
  const links = [...html.matchAll(/<a href="([^"]*)">/g)].map((match) => match[1]);
  assert.deepEqual(links, ["https://x.com/&quot;onmouseover=&quot;alert(1"]);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;a href=&quot;https://evil&quot;&gt;"));
});

test("detail models keep a short list of facts and actions", () => {
  const model = normalizeDetailModel(
    { title: { "zh-CN": "标题", en: "Title" }, markdown: "x", meta: [{ label: "State", value: "open" }, { label: "Count", value: 3 }, { label: "", value: "x" }], actions: [{ id: "a", title: "A" }] },
    "en",
  );
  assert.deepEqual([model.title, model.markdown, model.meta, model.actions.length], ["Title", "x", [{ label: "State", value: "open" }, { label: "Count", value: "3" }], 1]);
  assert.deepEqual(normalizeDetailModel(null, "en").meta, []);
});

test("form fields are checked, and submitted values follow the field types", () => {
  const { fields, submitTitle } = normalizeFormModel(
    {
      submitTitle: "Save",
      fields: [
        { key: "repo", type: "string", title: "Repository", value: "a/b" },
        { key: "note", type: "multiline", title: "Note" },
        { key: "count", type: "number", title: "Count", min: 1, max: 10, value: 50 },
        { key: "on", type: "boolean", title: "On", value: true },
        { key: "mode", type: "select", title: "Mode", options: [{ value: "a", title: "A" }, { value: "b", title: "B" }], value: "z" },
        { key: "bad key", type: "string", title: "Bad" },
        { key: "html", type: "html", title: "No" },
        { key: "repo", type: "string", title: "Duplicate" },
        { key: "empty", type: "select", title: "No options" },
      ],
    },
    "en",
  );
  assert.equal(submitTitle, "Save");
  assert.deepEqual(fields.map((field) => [field.key, field.value]), [["repo", "a/b"], ["note", ""], ["count", 10], ["on", true], ["mode", "a"]]);
  assert.deepEqual(formValues(fields, { count: 0, note: "x".repeat(5000), mode: "b", on: "yes" }), {
    repo: "a/b",
    note: "x".repeat(4000),
    count: 1,
    on: false,
    mode: "b",
  });
});

test("status models clamp progress and pick a known tone", () => {
  assert.deepEqual(normalizeStatusModel({ primary: "24:59", secondary: "Focus", progress: 1.5, tone: "accent" }, "en"), {
    primary: "24:59", secondary: "Focus", caption: null, progress: 1, tone: "accent", actions: [],
  });
  assert.deepEqual([normalizeStatusModel({ progress: "half", tone: "loud" }, "en").progress, normalizeStatusModel({ tone: "loud" }, "en").tone], [null, "neutral"]);
});
