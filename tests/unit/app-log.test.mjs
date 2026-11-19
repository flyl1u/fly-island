import assert from "node:assert/strict";
import test from "node:test";
import { formatLogValue } from "../../src/features/diagnostics/appLogCapture.ts";

test("log lines keep an error's stack and turn objects into JSON", () => {
  const error = new Error("boom");
  assert.equal(formatLogValue(error), error.stack);
  assert.equal(formatLogValue("plain"), "plain");
  assert.equal(formatLogValue({ code: 3 }), '{"code":3}');
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(formatLogValue(cyclic), "[object Object]");
  assert.equal(formatLogValue(undefined), "undefined");
});
