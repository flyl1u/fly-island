import assert from "node:assert/strict";
import test from "node:test";
import { releaseProblems, versionOfSdkTag } from "../../scripts/plugins/check-sdk-release.mjs";

test("only sdk-v<version> tags name a release", () => {
  assert.equal(versionOfSdkTag("sdk-v0.2.1"), "0.2.1");
  assert.equal(versionOfSdkTag("sdk-v1.0.0-beta.2"), "1.0.0-beta.2");
  assert.equal(versionOfSdkTag("v0.2.1"), null);
  assert.equal(versionOfSdkTag("sdk-v0.2"), null);
  assert.equal(versionOfSdkTag(undefined), null);
});

test("both packages must carry the tag's version", () => {
  const same = { "fly-island-plugin": "0.2.1", "create-fly-island-plugin": "0.2.1" };
  assert.deepEqual(releaseProblems("sdk-v0.2.1", same), []);
  const behind = { ...same, "create-fly-island-plugin": "0.2.0" };
  assert.match(releaseProblems("sdk-v0.2.1", behind).join(), /create-fly-island-plugin is at 0\.2\.0/);
  assert.match(releaseProblems("release-1", same).join(), /not a tag/);
});
