import assert from "node:assert/strict";
import test from "node:test";
import { evaluateWhen } from "../../src/features/plugins/when.ts";

const context = { "island.expanded": true, "island.page": "todo", "todos.hasActive": false };

test("an empty when clause always holds", () => {
  assert.equal(evaluateWhen(undefined, context), true);
  assert.equal(evaluateWhen(null, context), true);
  assert.equal(evaluateWhen("  ", context), true);
});

test("names, comparisons and negation read the context", () => {
  assert.equal(evaluateWhen("island.expanded", context), true);
  assert.equal(evaluateWhen("todos.hasActive", context), false);
  assert.equal(evaluateWhen("!todos.hasActive", context), true);
  assert.equal(evaluateWhen("island.page == todo", context), true);
  assert.equal(evaluateWhen("island.page == 'todo'", context), true);
  assert.equal(evaluateWhen('island.page != "music"', context), true);
  assert.equal(evaluateWhen("island.page == music", context), false);
  assert.equal(evaluateWhen("unknown.name", context), false);
  assert.equal(evaluateWhen("unknown.name != x", context), true);
});

test("&& binds tighter than || and parentheses group", () => {
  assert.equal(evaluateWhen("todos.hasActive && island.expanded || island.page == todo", context), true);
  assert.equal(evaluateWhen("todos.hasActive && (island.expanded || island.page == todo)", context), false);
  assert.equal(evaluateWhen("!(island.expanded && island.page == todo)", context), false);
  assert.equal(evaluateWhen("island.expanded&&!todos.hasActive", context), true);
});

test("clauses that do not parse never hold", () => {
  for (const clause of ["island.expanded &&", "(island.expanded", "island.expanded)", "== todo", "island.page ==", "'open", "a ; b", "island.expanded island.page"]) {
    assert.equal(evaluateWhen(clause, context), false, clause);
  }
});
