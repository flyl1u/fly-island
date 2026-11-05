// `fly-island-plugin test`: the plugin's own tests (test/*.test.mjs, run with
// node --test), or a smoke test under the mock host when it has none.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { startMockHost } from "./test/mock-host.mjs";
import { METHOD_NOT_FOUND, PERMISSION_DENIED } from "./test/methods.mjs";
import { report, validatePlugin } from "./validate.mjs";

const TEST_FILE = /\.test\.(mjs|js|cjs)$/;
const SETTLE_MS = 1500;

function testFiles(dir) {
  const testDir = path.join(dir, "test");
  if (!existsSync(testDir)) return [];
  return readdirSync(testDir, { recursive: true })
    .map(String)
    .filter((name) => TEST_FILE.test(name))
    .map((name) => path.join("test", name));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the plugin, runs each command and opens each view, then stops it.
 * Fails when it exits by itself or a request fails with "unknown method" or
 * "permission denied" (other host errors depend on data and only show up in the log).
 */
export async function smokeTest(dir, out = console) {
  const host = startMockHost(dir);
  const problems = [];
  try {
    await pause(SETTLE_MS);
    const contributes = host.manifest.contributes ?? {};
    for (const view of contributes.views ?? []) {
      host.viewVisible(view.id, true);
    }
    for (const command of contributes.commands ?? []) {
      host.command(command.id);
    }
    await pause(SETTLE_MS);
    for (const view of contributes.views ?? []) {
      if (!host.views.has(view.id)) out.log(`note: the view "${view.id}" got no model after it was shown.`);
      host.viewVisible(view.id, false);
    }
  } finally {
    if (host.exitCode !== undefined) problems.push(`The plugin exited by itself (code ${host.exitCode}).`);
    await host.stop();
  }
  for (const request of host.requests) {
    if (request.error && [METHOD_NOT_FOUND, PERMISSION_DENIED].includes(request.error.code)) {
      problems.push(`${request.method}: ${request.error.message}`);
    }
  }
  for (const line of host.logs) out.log(`log: ${line}`);
  out.log(`${host.requests.length} request(s): ${[...new Set(host.requests.map((request) => request.method))].join(", ") || "none"}`);
  for (const problem of problems) out.error(`error: ${problem}`);
  if (problems.length === 0) out.log("smoke test passed");
  return problems.length === 0;
}

export async function runTests(dir) {
  if (!report(validatePlugin(dir, { allowExperimental: true }))) return 1;
  const files = testFiles(dir);
  if (files.length === 0) {
    console.log("No test/*.test.mjs files; running the smoke test under the mock host.");
    return (await smokeTest(dir)) ? 0 : 1;
  }
  const result = spawnSync(process.execPath, ["--test", ...files], { cwd: dir, stdio: "inherit" });
  return result.status ?? 1;
}
