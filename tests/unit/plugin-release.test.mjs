import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPublishedPlugin, verifyPluginBuild } from "../../scripts/release/release-plugins.mjs";

const bytes = Buffer.from("plugin zip bytes");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const name = "eye-care-0.2.0-windows-x86_64.zip";
const entry = { id: "eye-care", version: "0.2.0", apiVersion: 1, minAppVersion: "3.3.0", url: `https://github.com/flyl1u/fly-island/releases/download/plugins-channel/${name}`, sha256, size: bytes.length };

test("build verification checks the exact selection, URL and ZIP integrity", () => {
  assert.deepEqual(verifyPluginBuild([entry], [entry.id], () => bytes), [{ name, entry }]);
  assert.throws(() => verifyPluginBuild([entry], ["minimax"], () => bytes), /entry/);
  assert.throws(() => verifyPluginBuild([{ ...entry, url: "https://example.com/other.zip" }], [entry.id], () => bytes), /entry/);
  assert.throws(() => verifyPluginBuild([{ ...entry, size: 1 }], [entry.id], () => bytes), /mismatch/);
  assert.throws(() => verifyPluginBuild([entry], [entry.id], () => Buffer.alloc(bytes.length)), /mismatch/);
});

test("identical or previously verified ZIPs are reused, never overwritten", () => {
  const local = { name, entry };
  const previous = { ...entry, sha256: "a".repeat(64), size: 20 };
  assert.deepEqual(selectPublishedPlugin(local, undefined, undefined), { ...local, upload: true });
  assert.deepEqual(selectPublishedPlugin(local, entry, undefined), { ...local, upload: false });
  assert.deepEqual(selectPublishedPlugin(local, previous, previous), { name, entry: previous, upload: false });
  assert.throws(() => selectPublishedPlugin(local, previous, undefined), /never replaced/);
});
