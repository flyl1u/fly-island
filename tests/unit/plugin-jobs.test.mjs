import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadPercent, isJobActive, megabytes, restoreJobs, withJob, withoutJob } from "../../src/features/plugins/jobs.ts";

const job = (id, phase, extra = {}) => ({ id, phase, downloaded: 0, total: 0, error: null, ...extra });

test("only running stages keep a card busy", () => {
  for (const phase of ["downloading", "verifying", "installing", "uninstalling"]) assert.ok(isJobActive(job("a", phase)), phase);
  for (const value of [undefined, job("a", "failed"), job("a", "done")]) assert.equal(isJobActive(value), false);
});

test("jobs are replaced and removed per plugin", () => {
  const one = withJob({}, job("a", "downloading"));
  const two = withJob(one, job("b", "failed", { error: "plugin_download_timeout" }));
  assert.deepEqual(Object.keys(two), ["a", "b"]);
  assert.deepEqual(Object.keys(withoutJob(two, "a")), ["b"]);
  assert.equal(withoutJob(two, "missing"), two);
  assert.deepEqual(Object.keys(two), ["a", "b"]);
});

test("a reopened page takes the host's list without overwriting newer events", () => {
  // "a" had news after the question; "gone" finished while the page was closed.
  const current = { a: job("a", "installing"), gone: job("gone", "downloading") };
  const listed = [job("a", "downloading"), job("b", "downloading", { downloaded: 5, total: 10 }), job("c", "done")];
  const restored = restoreJobs(current, listed, new Set(["a"]));
  assert.equal(restored.a.phase, "installing");
  assert.equal(restored.b.downloaded, 5);
  assert.equal(restored.c, undefined);
  assert.equal(restored.gone, undefined);
});

test("download progress shows whole percent and megabytes", () => {
  assert.equal(downloadPercent({ downloaded: 0, total: 0 }), null);
  assert.equal(downloadPercent({ downloaded: 3355443, total: 13421772 }), 25);
  assert.equal(downloadPercent({ downloaded: 20, total: 10 }), 100);
  assert.equal(megabytes(3355443), "3.2");
  assert.equal(megabytes(13421772), "12.8");
});
