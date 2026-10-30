import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadSigningEnvironment } from "../scripts/release-signing.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "focusd-signing-test-"));
  const config = {
    schemaVersion: 1,
    privateKeyPath: join(root, "private.key"),
    publicKeyPath: join(root, "public.key.pub"),
    passwordFile: join(root, "password.dpapi"),
  };
  writeFileSync(config.privateKeyPath, "encrypted fixture key");
  writeFileSync(config.publicKeyPath, "  fixture public key\n");
  writeFileSync(config.passwordFile, "encrypted fixture password");
  const configPath = join(root, "release.json");
  writeFileSync(configPath, JSON.stringify(config));
  return { root, config, configPath };
}

test("a machine without local credentials retains explicit CI configuration", () => {
  const env = { TAURI_UPDATER_PUBKEY: "CI public key", TAURI_SIGNING_PRIVATE_KEY: "CI private key", TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" };
  assert.deepEqual(loadSigningEnvironment(env, { configPath: "not-present.json" }), env);
});

test("an explicitly selected key never mixes with a different local key pair", () => {
  const { configPath } = fixture();
  const env = { TAURI_UPDATER_PUBKEY: "another public key" };
  assert.deepEqual(loadSigningEnvironment(env, { configPath, decryptPassword: () => { throw new Error("must not decrypt"); } }), env);
});

test("local signing loads the public key and private-key path without exposing key content", () => {
  const { config, configPath } = fixture();
  const env = { OTHER_SETTING: "retained" };
  const result = loadSigningEnvironment(env, {
    configPath,
    decryptPassword: (path) => {
      assert.equal(path, config.passwordFile);
      return "unlocked fixture password";
    },
  });
  assert.equal(result.TAURI_UPDATER_PUBKEY, "fixture public key");
  assert.equal(result.TAURI_SIGNING_PRIVATE_KEY, config.privateKeyPath);
  assert.equal(result.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, "unlocked fixture password");
  assert.equal(result.OTHER_SETTING, "retained");
  assert.deepEqual(env, { OTHER_SETTING: "retained" });
});

test("explicitly empty signing passwords do not trigger interactive decryption", () => {
  const { configPath } = fixture();
  const result = loadSigningEnvironment({ TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" }, {
    configPath,
    decryptPassword: () => { throw new Error("must not decrypt"); },
  });
  assert.equal(result.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, "");
});

test("missing key files fail before starting a build", () => {
  const { config, configPath, root } = fixture();
  config.privateKeyPath = join(root, "missing.key");
  writeFileSync(configPath, JSON.stringify(config));
  assert.throws(() => loadSigningEnvironment({}, { configPath }), /privateKeyPath/);
});

test("an empty public key cannot produce a release with updates disabled", () => {
  const { config, configPath } = fixture();
  writeFileSync(config.publicKeyPath, "\n");
  assert.throws(() => loadSigningEnvironment({}, { configPath }), /public key is empty/);
});

test("Windows password decryption errors stop the release", () => {
  const { configPath } = fixture();
  assert.throws(() => loadSigningEnvironment({}, {
    configPath,
    decryptPassword: () => { throw new Error("fixture DPAPI failure"); },
  }), /fixture DPAPI failure/);
});

test("a missing local configuration leaves the normal environment-variable checks in charge", () => {
  assert.deepEqual(loadSigningEnvironment({}, { configPath: "not-present.json" }), {});
});
