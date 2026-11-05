import assert from "node:assert/strict";
import test from "node:test";
import { isIdleCpu, megabytes, memorySplit } from "../../src/features/plugins/runStats.ts";

const MB = 1024 * 1024;
const resources = (extra) => ({
  memoryBytes: 64.4 * MB, runtimeBytes: 61.1 * MB, cpuPercent: 0, highCpu: false,
  processes: [{ name: "powershell.exe", memoryBytes: 63.2 * MB, workingSetBytes: 78.6 * MB }],
  ...extra,
});

test("a script plugin's memory is split into the runtime's share and its own", () => {
  assert.deepEqual(memorySplit(resources()), { total: "64.4", runtime: { name: "PowerShell", megabytes: "61.1", plugin: "3.3" } });
  assert.equal(memorySplit(resources({ processes: [{ name: "NODE.EXE", memoryBytes: 1, workingSetBytes: 1 }] })).runtime?.name, "Node.js");
});

test("without a measured runtime the memory is shown as one number", () => {
  assert.deepEqual(memorySplit(resources({ runtimeBytes: null })), { total: "64.4", runtime: null });
  assert.equal(memorySplit(resources({ processes: [{ name: "my-plugin.exe", memoryBytes: 1, workingSetBytes: 1 }] })).runtime, null);
  assert.equal(memorySplit(resources({ processes: [] })).runtime, null);
});

test("the plugin's own share is never negative", () => {
  assert.deepEqual(memorySplit(resources({ memoryBytes: 60 * MB })).runtime, { name: "PowerShell", megabytes: "60.0", plugin: "0.0" });
});

test("CPU under 0.1 % reads as idle and megabytes keep one decimal", () => {
  assert.equal(isIdleCpu(0), true);
  assert.equal(isIdleCpu(0.04), true);
  assert.equal(isIdleCpu(0.1), false);
  assert.equal(megabytes(1.25 * MB), "1.3");
});
