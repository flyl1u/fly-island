import assert from "node:assert/strict";
import test from "node:test";
import { msiNames, msiVersion } from "../../scripts/release/msi-version.mjs";

test("the MSI may be named after either version", () => {
  assert.deepEqual(msiNames("0.3.0"), ["_0.3.0_x64_en-US.msi"]);
  assert.deepEqual(msiNames("0.3.1-beta.1"), ["_0.3.1-beta.1_x64_en-US.msi", "_0.3.1.1_x64_en-US.msi"]);
});

test("a plain version needs no MSI override", () => {
  assert.equal(msiVersion("0.3.0"), null);
});

test("a pre-release becomes a numeric build number", () => {
  assert.equal(msiVersion("0.3.1-beta.1"), "0.3.1.1");
  assert.equal(msiVersion("0.3.1-rc.12"), "0.3.1.12");
  assert.equal(msiVersion("0.3.1-beta"), "0.3.1.1");
});

test("versions MSI cannot hold are refused", () => {
  assert.throws(() => msiVersion("0.3.1.beta.1"), /not a version/);
  assert.throws(() => msiVersion("256.0.0"), /does not fit/);
  assert.throws(() => msiVersion("0.3.1-beta.0"), /1-65535/);
});
