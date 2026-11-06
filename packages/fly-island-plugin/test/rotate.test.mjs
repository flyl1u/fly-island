import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { rotateKey } from "../src/rotate.mjs";
import { endorseKey, loadSigningKey, publicKeyOf, verifyEndorsement } from "../src/sign.mjs";

const pem = (key) => key.export({ format: "pem", type: "pkcs8" });

test("an endorsement holds only for its plugin, its new key and the old key", () => {
  const oldKey = generateKeyPairSync("ed25519").privateKey;
  const newKey = publicKeyOf(generateKeyPairSync("ed25519").privateKey);
  const old = publicKeyOf(oldKey);
  const endorsed = endorseKey("com.example.clock", newKey, oldKey);
  assert.equal(endorsed.endorsedBy.keyId, old.keyId);
  assert.equal(verifyEndorsement("com.example.clock", endorsed, [old]), true);
  assert.equal(verifyEndorsement("com.example.other", endorsed, [old]), false, "another plugin");
  assert.equal(verifyEndorsement("com.example.clock", { ...endorsed, publicKey: old.publicKey }, [old]), false, "another new key");
  assert.equal(verifyEndorsement("com.example.clock", endorsed, [newKey]), false, "the old key is not listed");
  assert.equal(verifyEndorsement("com.example.clock", newKey, [old]), false, "no endorsement");
});

test("rotating keeps the old key, writes the new one and endorses it for every id", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fly-island-rotate-"));
  try {
    const oldKey = generateKeyPairSync("ed25519").privateKey;
    const old = publicKeyOf(oldKey);
    const env = { FLY_ISLAND_PLUGIN_SIGNING_KEY: pem(oldKey) };
    assert.throws(() => rotateKey({ file: "unused", ids: ["a.b"], env }), /--new-key/);
    const newFile = path.join(dir, "new.key");
    const result = rotateKey({ file: "unused", newFile, ids: ["a.b", "a.c"], env });
    assert.equal(result.oldKeyId, old.keyId);
    assert.equal(result.retiredFile, null);
    assert.ok(existsSync(newFile));
    const fresh = publicKeyOf(loadSigningKey({ file: newFile, env: {} }));
    assert.deepEqual(result.endorsed.map((item) => item.id), ["a.b", "a.c"]);
    for (const { id, key } of result.endorsed) {
      assert.equal(key.keyId, fresh.keyId);
      assert.equal(verifyEndorsement(id, key, [old]), true, id);
    }
    assert.throws(() => rotateKey({ file: "unused", newFile, ids: ["a.b"], env }), /already exists/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
