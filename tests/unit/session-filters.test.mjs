import assert from "node:assert/strict";
import test from "node:test";
import { applySessionFilters, folderKey, matchesFilter, normalizeSessionFilters } from "../../src/features/agent-status/sessionFilters.ts";

const session = (cwd, title = null, lastPrompt = null) => ({ cwd, title, lastPrompt });

test("a folder rule hides the folder and its subfolders, whatever the slashes and case", () => {
  const rule = { kind: "folder", value: "E:\\Projects\\Scratch\\" };
  assert.equal(folderKey(rule.value), "e:/projects/scratch");
  assert.equal(matchesFilter(session("e:/projects/scratch"), rule), true);
  assert.equal(matchesFilter(session("E:\\Projects\\scratch\\sub\\dir"), rule), true);
  assert.equal(matchesFilter(session("E:\\Projects\\scratch-two"), rule), false, "a sibling with the same start is not inside");
  assert.equal(matchesFilter(session(null), rule), false);
});

test("a text rule matches the title or the latest prompt, ignoring case", () => {
  const rule = { kind: "prompt", value: " /LOOP " };
  assert.equal(matchesFilter(session("C:/x", "/loop check CI"), rule), true);
  assert.equal(matchesFilter(session("C:/x", "fix login", "run /loop 5m"), rule), true);
  assert.equal(matchesFilter(session("C:/x", "fix login", "write tests"), rule), false);
});

test("filtering keeps the same array when nothing is hidden", () => {
  const sessions = [session("C:/a", "one"), session("C:/b", "two")];
  assert.equal(applySessionFilters(sessions, []), sessions);
  assert.equal(applySessionFilters(sessions, [{ kind: "prompt", value: "three" }]), sessions);
  assert.deepEqual(applySessionFilters(sessions, [{ kind: "folder", value: "C:\\a" }]), [sessions[1]]);
});

test("saved rules: only well-formed, non-empty and distinct ones", () => {
  assert.deepEqual(normalizeSessionFilters("oops"), []);
  assert.deepEqual(normalizeSessionFilters([
    { kind: "folder", value: " C:\\a " },
    { kind: "folder", value: "c:/A/" },
    { kind: "prompt", value: "" },
    { kind: "other", value: "x" },
    { kind: "prompt", value: "Loop" },
    { kind: "prompt", value: "loop" },
    null,
  ]), [{ kind: "folder", value: "C:\\a" }, { kind: "prompt", value: "Loop" }]);
  assert.equal(normalizeSessionFilters(Array.from({ length: 60 }, (_, i) => ({ kind: "prompt", value: `r${i}` }))).length, 50);
});
