import assert from "node:assert/strict";
import test from "node:test";
import { nextWheelPage, wheelPageOrder } from "../../src/windows/island/wheelPages.ts";

const features = { todo: true, music: true, clipboard: true, shelf: false, qq: true, wechat: false, qqMail: false, agents: true, translation: false };
const order = ["todo", "music", "clipboard", "shelf", "translation"];

test("Ctrl + wheel follows the header: Agent, the enabled page dots, then messages", () => {
  assert.deepEqual(wheelPageOrder(order, features, false), ["agents", "todo", "music", "clipboard", "qq"]);
});

test("pages that open a window of their own are skipped", () => {
  assert.deepEqual(wheelPageOrder(order, features, true), ["agents", "todo", "music", "qq"]);
  assert.deepEqual(wheelPageOrder(order, { ...features, translation: true }, false), ["agents", "todo", "music", "clipboard", "translation", "qq"]);
});

test("the wheel steps one page and wraps round the ends", () => {
  const pages = ["agents", "todo", "qq"];
  assert.equal(nextWheelPage(pages, "todo", 1), "qq");
  assert.equal(nextWheelPage(pages, "qq", 1), "agents");
  assert.equal(nextWheelPage(pages, "agents", -1), "qq");
  assert.equal(nextWheelPage(pages, "settings", 1), "agents");
  assert.equal(nextWheelPage(["todo"], "todo", 1), null);
  assert.equal(nextWheelPage([], "todo", 1), null);
});
