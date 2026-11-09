import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, isPrerelease, shouldUpdateBetaManifest } from "../../scripts/release/channel.mjs";

test("pre-releases are told apart from final releases", () => {
  assert.equal(isPrerelease("0.3.1-beta.1"), true);
  assert.equal(isPrerelease("0.3.1"), false);
});

test("versions compare by semver precedence", () => {
  const ordered = ["0.3.0", "0.3.1-alpha", "0.3.1-beta.1", "0.3.1-beta.2", "0.3.1-beta.10", "0.3.1", "0.3.2-beta.1", "0.4.0"];
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(compareVersions(ordered[i - 1], ordered[i]) < 0, `${ordered[i - 1]} < ${ordered[i]}`);
    assert.ok(compareVersions(ordered[i], ordered[i - 1]) > 0, `${ordered[i]} > ${ordered[i - 1]}`);
  }
  assert.equal(compareVersions("0.3.1-beta.1", "0.3.1-beta.1"), 0);
  assert.throws(() => compareVersions("v0.3.1", "0.3.1"));
});

test("the beta manifest only moves forward", () => {
  assert.equal(shouldUpdateBetaManifest("0.3.1-beta.1", null), true);
  assert.equal(shouldUpdateBetaManifest("0.3.1", "0.3.1-beta.2"), true);
  assert.equal(shouldUpdateBetaManifest("0.3.1", "0.3.2-beta.1"), false);
});
