import assert from "node:assert/strict";
import test from "node:test";
import { shouldPreventContextMenu } from "../../src/lib/contextMenu.ts";

const element = (tagName, parentElement = null, isContentEditable = false) => ({
  tagName, parentElement, isContentEditable,
});

test("ordinary elements prevent the browser context menu", () => {
  assert.equal(shouldPreventContextMenu(null), true);
  for (const tagName of ["DIV", "BUTTON", "A", "svg"]) {
    assert.equal(shouldPreventContextMenu(element(tagName, element("BODY"))), true, tagName);
  }
});

test("input, textarea and select keep their context menu, including descendants", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    const control = element(tagName);
    assert.equal(shouldPreventContextMenu(control), false, tagName);
    assert.equal(shouldPreventContextMenu(element("SPAN", control)), false, `${tagName} descendant`);
  }
});

test("contenteditable elements and nested descendants keep their context menu", () => {
  const editor = element("DIV", element("BODY"), true);
  assert.equal(shouldPreventContextMenu(editor), false);
  assert.equal(shouldPreventContextMenu(element("SPAN", element("STRONG", editor))), false);
  assert.equal(shouldPreventContextMenu(element("svg", editor)), false);
});
