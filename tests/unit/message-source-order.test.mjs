import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SOURCE_ORDER, moveSource, normalizeSourceOrder } from "../../src/features/messages/sourceOrder.ts";
import { normalizeInstalledNativePlugins } from "../../src/features/plugins/native/storage.ts";

test("saved tab orders drop unknown sources and gain new ones at the end", () => {
  assert.deepEqual(normalizeSourceOrder(undefined), DEFAULT_SOURCE_ORDER);
  assert.deepEqual(normalizeSourceOrder(["qqMail", "bogus", "qqMail", "qq"]).slice(0, 3), ["qqMail", "qq", "wechat"]);
  assert.equal(normalizeSourceOrder(["qq"]).length, DEFAULT_SOURCE_ORDER.length);
});

test("dragging a tab moves it among the visible tabs and leaves hidden ones in place", () => {
  const order = ["wechat", "qq", "qqMail", "dingtalk", "feishu", "wecom", "plugin"];
  const visible = ["wechat", "qq", "qqMail", "feishu"];
  assert.deepEqual(moveSource(order, visible, "feishu", "wechat"), ["feishu", "wechat", "qq", "dingtalk", "qqMail", "wecom", "plugin"]);
  assert.deepEqual(moveSource(order, visible, "wechat", "qq"), ["qq", "wechat", "qqMail", "dingtalk", "feishu", "wecom", "plugin"]);
  assert.deepEqual(moveSource(order, visible, "qq", "qq"), order);
});

test("installed plugins keep only known ids", () => {
  const installed = normalizeInstalledNativePlugins(["feishu", "nope", 3]);
  assert.equal(installed.feishu, true);
  assert.equal(installed.dingtalk, false);
  assert.equal(installed.clockWeather, false);
  assert.equal(normalizeInstalledNativePlugins(["clockWeather"]).clockWeather, true);
  assert.equal(installed.calendarMarks, false);
  assert.equal(normalizeInstalledNativePlugins(["calendarMarks"]).calendarMarks, true);
  assert.equal(normalizeInstalledNativePlugins("bad").cursor, false);
});
