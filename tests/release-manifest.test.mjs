import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/make-latest-json.mjs", import.meta.url));
function fixture({ msiSignature = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "focusd-manifest-test-"));
  const nsis = join(root, "src-tauri/target/release/bundle/nsis");
  const msi = join(root, "src-tauri/target/release/bundle/msi");
  mkdirSync(nsis, { recursive: true });
  mkdirSync(msi, { recursive: true });
  mkdirSync(join(root, "docs/releases"), { recursive: true });
  writeFileSync(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "0.2.12" }));
  writeFileSync(join(root, "docs/releases/v0.2.12.md"), "Fixture release notes");
  writeFileSync(join(nsis, "fly-island_0.2.12_x64-setup.exe"), "fixture exe");
  writeFileSync(join(nsis, "fly-island_0.2.12_x64-setup.exe.sig"), "fixture NSIS signature\n");
  writeFileSync(join(msi, "fly-island_0.2.12_x64_en-US.msi"), "fixture msi");
  if (msiSignature) writeFileSync(join(msi, "fly-island_0.2.12_x64_en-US.msi.sig"), "fixture MSI signature\n");
  return { root, manifest: join(nsis, "latest.json") };
}

test("NSIS and MSI users receive the matching installer format and signature", () => {
  const { root, manifest } = fixture();
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(readFileSync(manifest, "utf8"));
  assert.equal(output.version, "0.2.12");
  assert.equal(output.notes, "Fixture release notes");
  assert.equal(output.platforms["windows-x86_64-nsis"].signature, "fixture NSIS signature");
  assert.match(output.platforms["windows-x86_64-nsis"].url, /v0\.2\.12\/fly-island_0\.2\.12_x64-setup\.exe$/);
  assert.equal(output.platforms["windows-x86_64-msi"].signature, "fixture MSI signature");
  assert.match(output.platforms["windows-x86_64-msi"].url, /v0\.2\.12\/fly-island_0\.2\.12_x64_en-US\.msi$/);
  assert.deepEqual(output.platforms["windows-x86_64"], output.platforms["windows-x86_64-nsis"]);
});

test("an unsigned MSI stops manifest generation instead of redirecting MSI users to NSIS", () => {
  const { root, manifest } = fixture({ msiSignature: false });
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing signed MSI/);
  assert.equal(existsSync(manifest), false);
});

test("public download URLs must use HTTPS", () => {
  const { root, manifest } = fixture();
  const result = spawnSync(process.execPath, [script, "--base-url", "http://example.com"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid HTTPS URL/);
  assert.equal(existsSync(manifest), false);
});
