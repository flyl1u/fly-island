import assert from "node:assert/strict";
import test from "node:test";
import {
  cycleShortcutPage,
  isPageEnabled,
  isPluginPage,
  pageForAltDigit,
  pageShortcutLabel,
  pageShortcutOrder,
  resolveIslandPage,
} from "../../src/windows/island/features.ts";
import { getPluginPageExpandedHeight } from "../../src/windows/island/layout.ts";

const all = { agents: true, todo: true, music: true, clipboard: true, shelf: true, qq: true, wechat: false, qqMail: false, translation: false };
const board = "plugin:dev.example.board/board";
const timer = "plugin:dev.example.pomodoro/timer";

test("without plugin pages the page order is what it was", () => {
  const withEmpty = { ...all, pluginPages: [] };
  assert.deepEqual(pageShortcutOrder(withEmpty), pageShortcutOrder(all));
  assert.deepEqual(pageShortcutOrder(all), ["agents", "todo", "music", "clipboard", "shelf", "qq"]);
  assert.equal(pageForAltDigit(withEmpty, 7), null);
});

test("plugin pages come after the built-in pages, in the order given", () => {
  const features = { ...all, pluginPages: [timer, board] };
  assert.equal(pageForAltDigit(features, 7), timer);
  assert.equal(pageForAltDigit(features, 8), board);
  assert.equal(pageShortcutLabel(features, board, "Alt"), "Alt+8");
  assert.equal(cycleShortcutPage(features, "qq", 1), timer);
  assert.equal(cycleShortcutPage(features, board, 1), "agents");
  assert.equal(cycleShortcutPage(features, "agents", -1), board);
  // Built-in pages switched off leave no gap.
  assert.equal(pageForAltDigit({ ...features, agents: false, music: false }, 5), timer);
});

test("a plugin page is on while its plugin lists it; otherwise the island falls back", () => {
  const features = { ...all, pluginPages: [board] };
  assert.equal(isPluginPage(board), true);
  assert.equal(isPluginPage("todo"), false);
  assert.equal(isPageEnabled(board, features), true);
  assert.equal(isPageEnabled(timer, features), false);
  assert.equal(resolveIslandPage(timer, features), "todo");
  const onlyPlugin = { todo: false, music: false, clipboard: false, shelf: false, qq: false, wechat: false, qqMail: false, agents: false, translation: false, pluginPages: [board] };
  assert.equal(resolveIslandPage("todo", onlyPlugin), board);
});

test("plugin pages get a height by template, within the panel limit", () => {
  assert.equal(getPluginPageExpandedHeight("status", 1000), 260);
  assert.equal(getPluginPageExpandedHeight("list", 1000), 400);
  assert.equal(getPluginPageExpandedHeight("list", 320), 320);
  assert.equal(getPluginPageExpandedHeight(null, 1000), 400);
});
