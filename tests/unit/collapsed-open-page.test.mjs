import assert from "node:assert/strict";
import test from "node:test";
import { collapsedOpenPage } from "../../src/windows/island/collapsedOpenPage.ts";

test("a lyric line on the collapsed island reopens the last page, not the music page", () => {
  assert.equal(collapsedOpenPage("lyrics", false, "clipboard"), "clipboard");
  assert.equal(collapsedOpenPage("lyrics", false, "todo"), "todo");
  // The last page stays the music page when that is where the user was.
  assert.equal(collapsedOpenPage("lyrics", false, "music"), "music");
});

test("a running agent the island names opens the Agent page", () => {
  assert.equal(collapsedOpenPage("agent", true, "todo"), "agents");
  // An agent that is not the shown item does not take the click.
  assert.equal(collapsedOpenPage("lyrics", true, "shelf"), "shelf");
  assert.equal(collapsedOpenPage("agent", false, "shelf"), "shelf");
});

test("a todo line or nothing shown reopens the last page", () => {
  assert.equal(collapsedOpenPage("todo", false, "translation"), "translation");
  assert.equal(collapsedOpenPage(null, false, "qq"), "qq");
});
