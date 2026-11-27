import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticMode } from "../../src/windows/island/diagnosticMode.ts";

test("a retraction is tucked and a peek behind an open panel is expanded", () => {
  assert.equal(diagnosticMode("collapsed", true, false), "tucked");
  assert.equal(diagnosticMode("collapsed", false, true), "peek");
  assert.equal(diagnosticMode("collapsed", false, false), "collapsed");
  assert.equal(diagnosticMode("expanded", false, true), "expanded");
});
