import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync } from "node:crypto";
import { MARKET_BASE_URL, createZip, packPlugin, readPackedFile, runtimeRequirement, sha256 } from "../../scripts/plugins/build-plugin-index.mjs";
import { keyIdOf, rawPublicKey, signIndex, verifyIndex } from "../../scripts/plugins/plugin-signing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("index signatures verify, survive CRLF and catch changes", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = rawPublicKey(publicKey);
  const trusted = [{ keyId: keyIdOf(raw), publicKey: raw.toString("base64") }];
  const text = '{\n  "version": 1\n}\n';
  const signature = signIndex(text, privateKey);
  assert.equal(signature.keyId, trusted[0].keyId);
  assert.equal(verifyIndex(text, signature, trusted), true);
  assert.equal(verifyIndex(text.replaceAll("\n", "\r\n"), signature, trusted), true);
  assert.equal(verifyIndex(text.replace("1", "2"), signature, trusted), false);
  assert.equal(verifyIndex(text, { ...signature, keyId: "other" }, trusted), false);
  assert.equal(verifyIndex(text, null, trusted), false);
});

test("the committed index is signed by a key in plugins/signing-keys.json", () => {
  const text = readFileSync(path.join(root, "plugins/index.json"), "utf8");
  const signature = JSON.parse(readFileSync(path.join(root, "plugins/index.json.sig"), "utf8"));
  const { keys } = JSON.parse(readFileSync(path.join(root, "plugins/signing-keys.json"), "utf8"));
  assert.equal(verifyIndex(text, signature, keys), true, "run pnpm plugins:index to re-sign");
});

test("zips are byte-for-byte reproducible", () => {
  const files = [["a.txt", Buffer.from("hello")], ["lib/b.mjs", Buffer.from("export {}")]];
  assert.ok(createZip(files).equals(createZip(files)));
  assert.notEqual(sha256(createZip(files)), sha256(createZip([files[0]])));
});

test("text files are packed with LF line ends", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "focusd-pack-"));
  try {
    writeFileSync(path.join(dir, "main.mjs"), "a\r\nb\r\n");
    writeFileSync(path.join(dir, "icon.png"), Buffer.from([0x0d, 0x0a]));
    assert.equal(readPackedFile(path.join(dir, "main.mjs")).toString(), "a\nb\n");
    assert.deepEqual([...readPackedFile(path.join(dir, "icon.png"))], [0x0d, 0x0a]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plugins/index.json and plugins/packages match the plugin sources (run pnpm plugins:index)", () => {
  const index = JSON.parse(readFileSync(path.join(root, "plugins/index.json"), "utf8"));
  const examplesDir = path.join(root, "plugins/examples");
  const ids = readdirSync(examplesDir).sort();
  assert.deepEqual(index.plugins.map((entry) => entry.id), ids);

  for (const id of ids) {
    const { manifest, fileName, zip } = packPlugin(path.join(examplesDir, id));
    const entry = index.plugins.find((item) => item.id === id);
    assert.equal(entry.version, manifest.version, id);
    assert.equal(entry.runtime, runtimeRequirement(manifest.runtime), id);
    assert.equal(entry.download.url, `${MARKET_BASE_URL}/packages/${fileName}`);
    assert.equal(entry.download.sha256, sha256(zip), `${id}: package is out of date`);
    assert.equal(entry.download.size, zip.length);
    assert.ok(readFileSync(path.join(root, "plugins/packages", fileName)).equals(zip), `${fileName} differs from its sources`);
  }
});

test("market updates are offered only for newer versions", async () => {
  const { isNewerVersion } = await import("../../src/features/plugins/version.ts");
  assert.equal(isNewerVersion("1.0.1", "1.0.0"), true);
  assert.equal(isNewerVersion("1.10.0", "1.9.9"), true);
  assert.equal(isNewerVersion("2", "1.9"), true);
  assert.equal(isNewerVersion("1.0.0", "1.0.0"), false);
  assert.equal(isNewerVersion("1.0", "1.0.0"), false);
  assert.equal(isNewerVersion("1.0.0-beta", "1.0.0"), false);
  assert.equal(isNewerVersion("0.9.0", "1.0.0"), false);
  // Pre-releases, in the same order as compare_versions in manifest.rs.
  assert.equal(isNewerVersion("1.0.0", "1.0.0-beta.2"), true, "a release updates its own beta");
  assert.equal(isNewerVersion("1.0.0-beta.2", "1.0.0-beta.1"), true);
  assert.equal(isNewerVersion("1.0.0-beta.10", "1.0.0-beta.2"), true);
  assert.equal(isNewerVersion("1.0.0-beta", "1.0.0-alpha"), true);
  assert.equal(isNewerVersion("1.0.0-beta.1", "1.0.0-beta"), true);
  assert.equal(isNewerVersion("1.0.0-beta", "1.0.0-1"), true);
  assert.equal(isNewerVersion("1.0.0+build.2", "1.0.0"), false);
});

test("the index says what each plugin needs installed", () => {
  assert.equal(runtimeRequirement({ type: "process", command: "bin/app.EXE" }), "exe");
  assert.equal(runtimeRequirement({ type: "process", command: "main.ps1" }), "powershell");
  assert.equal(runtimeRequirement({ type: "process", command: "main.mjs" }), "node");
  assert.equal(runtimeRequirement({ type: "none" }), "none");
  assert.equal(runtimeRequirement(undefined), "none");
});
