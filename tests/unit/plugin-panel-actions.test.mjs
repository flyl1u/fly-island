import assert from "node:assert/strict";
import test from "node:test";
import { islandPanelActions } from "../../src/features/plugins/panelActions.ts";
import { pluginPagesFrom } from "../../src/windows/island/features.ts";

const rest = { attention: true, actions: ["snooze_10", "skip"], islandActions: [], rows: [] };

test("a panel can keep its window's actions off the page without changing them", () => {
  assert.deepEqual(islandPanelActions(rest), []);
  assert.deepEqual(rest.actions, ["snooze_10", "skip"], "the payload keeps the actions the break window uses");
  assert.deepEqual(islandPanelActions({ ...rest, actions: ["skip"], islandActions: [] }), []);
  assert.deepEqual(islandPanelActions({ ...rest, actions: ["refresh", "skip"], islandActions: ["refresh"] }), ["refresh"]);
});

test("without islandActions the page shows every published action", () => {
  assert.deepEqual(islandPanelActions({ attention: false, actions: ["rest_now"], islandActions: null }), ["rest_now"]);
  assert.deepEqual(islandPanelActions({ attention: false, actions: ["rest_now"] }), ["rest_now"], "a panel that predates the field keeps its buttons");
  assert.deepEqual(islandPanelActions(null), []);
});

test("island height counts the visible actions rather than the break-window controls", () => {
  const installed = { "eye-care": { enabled: true, development: true, manifest: {
    id: "eye-care", name: { "zh-CN": "护眼提醒", en: "Eye Care" },
    runtime: { command: "eye-care.exe" }, contributes: ["panel"], panel: { icon: "heart-pulse" },
  } } };
  assert.equal(pluginPagesFrom(installed, { "eye-care": { panel: rest } })[0].actions, 0);
  const working = { attention: false, actions: ["rest_now"], islandActions: ["rest_now"], rows: [] };
  assert.equal(pluginPagesFrom(installed, { "eye-care": { panel: working } })[0].actions, 1);
});
