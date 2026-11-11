import assert from "node:assert/strict";
import test from "node:test";
import { pickCollapsedItem } from "../../src/windows/island/collapsedItem.ts";

const TODO_FIRST = ["todo", "agent", "lyrics"];
const DEFAULT_ORDER = ["agent", "lyrics", "todo"];

test("a started todo ranked above the agent is what the collapsed island shows", () => {
  assert.equal(pickCollapsedItem(TODO_FIRST, { todo: true, agent: true, lyrics: true }, true), "todo");
  // Ranked below, it still waits its turn.
  assert.equal(pickCollapsedItem(DEFAULT_ORDER, { todo: true, agent: true, lyrics: false }, true), "agent");
});

test("with no todo started, the remaining count gives way to a running agent or a lyric line", () => {
  assert.equal(pickCollapsedItem(TODO_FIRST, { todo: true, agent: true, lyrics: false }, false), "agent");
  assert.equal(pickCollapsedItem(TODO_FIRST, { todo: true, agent: false, lyrics: true }, false), "lyrics");
  assert.equal(pickCollapsedItem(["todo", "lyrics", "agent"], { todo: true, agent: true, lyrics: true }, false), "lyrics");
});

test("an unstarted todo still shows when nothing else has anything", () => {
  assert.equal(pickCollapsedItem(TODO_FIRST, { todo: true, agent: false, lyrics: false }, false), "todo");
  assert.equal(pickCollapsedItem(DEFAULT_ORDER, { todo: true, agent: false, lyrics: false }, false), "todo");
});

test("nothing to show leaves the text place empty", () => {
  assert.equal(pickCollapsedItem(TODO_FIRST, { todo: false, agent: false, lyrics: false }, false), null);
  assert.equal(pickCollapsedItem(DEFAULT_ORDER, { todo: false, agent: false, lyrics: false }), null);
});
