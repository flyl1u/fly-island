import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSigningKey, parsePackageName, publicKeyOf, sha256Hex, signedText, signPackage, verifyPackage, writePackageSignature } from "../src/sign.mjs";

const { privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ format: "pem", type: "pkcs8" });
const zip = Buffer.from("zip bytes");

test("the signed text names the plugin, the version and the zip's hash", () => {
  assert.equal(signedText("com.example.clock", "1.2.0", "AB".repeat(32)), `focusd-plugin-package/1\ncom.example.clock\n1.2.0\n${"ab".repeat(32)}`);
});

test("a package signature verifies only for the same plugin, version, bytes and listed key", () => {
  const key = publicKeyOf(privateKey);
  assert.match(key.keyId, /^[0-9a-f]{16}$/);
  const signature = signPackage("com.example.clock", "1.2.0", zip, privateKey);
  assert.equal(signature.keyId, key.keyId);
  const sha = sha256Hex(zip);
  assert.equal(verifyPackage("com.example.clock", "1.2.0", sha, signature, [key]), key.keyId);
  assert.equal(verifyPackage("com.example.other", "1.2.0", sha, signature, [key]), null, "another plugin");
  assert.equal(verifyPackage("com.example.clock", "1.2.1", sha, signature, [key]), null, "another version");
  assert.equal(verifyPackage("com.example.clock", "1.2.0", sha256Hex(Buffer.from("other")), signature, [key]), null, "other bytes");
  const other = publicKeyOf(generateKeyPairSync("ed25519").privateKey);
  assert.equal(verifyPackage("com.example.clock", "1.2.0", sha, signature, [other]), null, "a key that is not listed");
  assert.equal(verifyPackage("com.example.clock", "1.2.0", sha, signature, [{ ...other, keyId: key.keyId }]), null, "a keyId that does not match its key");
});

test("the key comes from the environment, and pack names give the id and version", () => {
  const key = loadSigningKey({ env: { FLY_ISLAND_PLUGIN_SIGNING_KEY: pem }, file: "nowhere" });
  assert.equal(publicKeyOf(key).keyId, publicKeyOf(privateKey).keyId);
  assert.throws(() => loadSigningKey({ env: {}, file: path.join(tmpdir(), "no-such-fly-island-key") }), /keygen/);
  assert.deepEqual(parsePackageName("out/dev.focusd.todo-digest-1.2.1.zip"), { id: "dev.focusd.todo-digest", version: "1.2.1" });
  assert.deepEqual(parsePackageName("a.b-c-1.0.0-beta.1.zip"), { id: "a.b-c", version: "1.0.0-beta.1" });
  assert.equal(parsePackageName("notes.zip"), null);
});

test("writePackageSignature writes <zip>.sig next to the zip", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fly-island-sign-"));
  try {
    const file = path.join(dir, "com.example.clock-1.0.0.zip");
    writePackageSignature(file, "com.example.clock", "1.0.0", zip, privateKey);
    const written = JSON.parse(readFileSync(`${file}.sig`, "utf8"));
    assert.equal(verifyPackage("com.example.clock", "1.0.0", sha256Hex(zip), written, [publicKeyOf(privateKey)]), written.keyId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
