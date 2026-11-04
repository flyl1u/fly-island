import assert from "node:assert/strict";
import test from "node:test";
import { parsePanelPreview } from "../src/windows/settings/storage.ts";

test("panel preview requests are read only while fresh and well formed", () => {
  const now = 10_000;
  const request = (mode, requestedAt = now - 100) => JSON.stringify({ mode, requestedAt });

  assert.equal(parsePanelPreview(request("expanded"), now), "expanded");
  assert.equal(parsePanelPreview(request("collapsed"), now), "collapsed");
  // A request left over from an earlier session must not open the island.
  assert.equal(parsePanelPreview(request("expanded", now - 5_000), now), null);
  assert.equal(parsePanelPreview(request("tucked"), now), null);
  assert.equal(parsePanelPreview(JSON.stringify({ mode: "expanded" }), now), null);
  assert.equal(parsePanelPreview("{broken", now), null);
  assert.equal(parsePanelPreview(null, now), null);
});
