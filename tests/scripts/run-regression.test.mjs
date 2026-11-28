import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PAGES, pageOutcome, passedChecks, runPool, workerCount } from "../../scripts/run-regression.mjs";

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

test("workers default by core count, can be asked for, and performance pages stay serial", () => {
  assert.equal(workerCount({ cores: 32 }), 6);
  assert.equal(workerCount({ cores: 12 }), 3);
  assert.equal(workerCount({ cores: 4 }), 1);
  assert.equal(workerCount({ requested: "8", cores: 4 }), 8);
  assert.equal(workerCount({ requested: "8", cores: 32, serial: true }), 1);
  for (const bad of ["0", "1.5", "many"]) assert.throws(() => workerCount({ requested: bad, cores: 8 }), /--workers/);
});

test("the pool runs every item once, never more at a time than it has workers", async () => {
  let running = 0;
  let most = 0;
  const results = await runPool([30, 5, 6, 7, 8], ["a", "b"], async (ms) => {
    most = Math.max(most, ++running);
    await new Promise((resolve) => setTimeout(resolve, ms));
    running -= 1;
    return ms * 2;
  });
  assert.equal(most, 2);
  assert.deepEqual(results, [60, 10, 12, 14, 16]);
});

test("each run gets free ports of its own", async () => {
  const { freePort } = await import("../../scripts/run-regression.mjs");
  const [a, b] = await Promise.all([freePort(), freePort()]);
  assert.ok(Number.isInteger(a) && a > 0 && Number.isInteger(b) && b > 0);
});
