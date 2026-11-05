import assert from "node:assert/strict";
import test from "node:test";
import { needsRust } from "../../scripts/land-check.mjs";

test("cargo test runs only when a landing touches what the Rust side reads", () => {
  assert.equal(needsRust(["src/App.tsx", "docs/plugins/README.md"]), false);
  assert.equal(needsRust(["src-tauri/src/lib.rs"]), true);
  assert.equal(needsRust(["src-tauri/src/agent_status/hooks/focusd-agent-status.ps1"]), true);
  assert.equal(needsRust(["scripts/release/release.mjs"]), false);
  assert.equal(needsRust(["plugins/index.json"]), true);
  assert.equal(needsRust([]), false);
});
