import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generatedFiles } from "../../scripts/plugins/build-plugin-sdk.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8").replaceAll("\r\n", "\n");

test("the generated SDK files match their sources (run pnpm sdk:build)", () => {
  for (const [relative, expected] of generatedFiles(root)) {
    assert.equal(read(relative), expected, relative);
  }
});

test("the PowerShell module exports every function and stays ASCII", () => {
  const module = read("packages/powershell/FlyIsland.Plugin/FlyIsland.Plugin.psm1");
  const manifest = read("packages/powershell/FlyIsland.Plugin/FlyIsland.Plugin.psd1");
  const functions = [...module.matchAll(/^function ([\w-]+)/gm)].map((match) => match[1]).sort();
  const exported = [...manifest.matchAll(/'([A-Za-z]+-Focusd\w*)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(exported, functions);
  assert.ok([...module].every((char) => char.charCodeAt(0) < 128), "FlyIsland.Plugin.psm1 must be ASCII for PowerShell 5.1");
  assert.ok([...read("plugins/sdk/powershell/focusd.ps1")].every((char) => char.charCodeAt(0) < 128));
});

test("the npm packages publish what they reference", () => {
  for (const name of ["fly-island-plugin", "create-fly-island-plugin"]) {
    const pkg = JSON.parse(read(`packages/${name}/package.json`));
    for (const target of Object.values(pkg.bin)) assert.ok(pkg.files.includes(target.split("/")[0]), `${name}: ${target}`);
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], `${name} has no runtime dependencies`);
  }
  const versions = ["fly-island-plugin", "create-fly-island-plugin"].map((name) => JSON.parse(read(`packages/${name}/package.json`)).version);
  assert.equal(versions[0], versions[1], "create-fly-island-plugin makes plugins depend on its own version of fly-island-plugin");
});
