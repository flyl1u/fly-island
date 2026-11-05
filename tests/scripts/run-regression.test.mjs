import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PAGES, pageOutcome, passedChecks } from "../../scripts/run-regression.mjs";

test("each way a regression page reports its result is understood", () => {
  assert.equal(pageOutcome({ testResult: "passed" }), "passed");
  assert.equal(pageOutcome({ testResult: "failed" }), "failed");
  assert.equal(pageOutcome({ dataResult: "passed" }), "passed");
  assert.equal(pageOutcome({ text: "ALL PASS\nPASS a" }), "passed");
  assert.equal(pageOutcome({ text: "SOME FAILED\nFAIL a" }), "failed");
  assert.equal(pageOutcome({ text: "PASS a\nPASS b\n\n全部 2 项检查通过。" }), "passed");
  assert.equal(pageOutcome({ text: "PASS a\nFAIL Error: b" }), "failed");
});

test("a page that is still running has no outcome yet", () => {
  assert.equal(pageOutcome({}), null);
  assert.equal(pageOutcome({ text: "准备消息动画检查…" }), null);
  assert.equal(pageOutcome({ text: "PASS a\nPASS b" }), null);
});

test("passed checks are counted from PASS lines only", () => {
  assert.equal(passedChecks("PASS a\nPASS b\nFAIL c\n  PASS not at line start"), 2);
  assert.equal(passedChecks(""), 0);
});

test("every listed regression page exists", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  for (const page of PAGES) assert.ok(existsSync(path.join(root, "tests/regression", page.split("?")[0])), page);
});
