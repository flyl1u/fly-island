import assert from "node:assert/strict";
import test from "node:test";
import { visiblePluginSettings } from "../../src/features/plugins/pluginSettings.ts";

const localized = (text) => ({ "zh-CN": text, en: text });
const mode = {
  key: "mode", label: localized("提醒方式"), type: "choice", default: "lock", options: [],
};
const restMinutes = {
  key: "rest-minutes", label: localized("休息时长"), type: "number", default: "1", options: [],
  showWhen: { key: "mode", value: "lock" },
};
const idle = { key: "idle", label: localized("空闲时长"), type: "number", default: "5", options: [] };
const settings = [mode, restMinutes, idle];

test("a conditional setting follows the value of the setting it waits for", () => {
  assert.deepEqual(visiblePluginSettings(settings, {}).map((setting) => setting.key), ["mode", "rest-minutes", "idle"]);
  assert.deepEqual(visiblePluginSettings(settings, { mode: "notify" }).map((setting) => setting.key), ["mode", "idle"]);
  assert.deepEqual(visiblePluginSettings(settings, { mode: "lock", "rest-minutes": "2" }).map((setting) => setting.key),
    ["mode", "rest-minutes", "idle"]);
});

test("a rule that points at a setting the manifest no longer has keeps its row visible", () => {
  const orphan = { ...idle, key: "skip", showWhen: { key: "gone", value: "lock" } };
  assert.deepEqual(visiblePluginSettings([orphan], {}).map((setting) => setting.key), ["skip"]);
});
