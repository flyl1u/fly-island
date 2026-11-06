import assert from "node:assert/strict";
import test from "node:test";
import { attributedCommits, checksFor, docsOnly, needsRust, recordPass } from "../../scripts/land-check.mjs";

test("a landing of Markdown docs alone runs the doc checks, except generated docs", () => {
  assert.equal(docsOnly(["docs/tasks/F1.md", "AGENTS.md"]), true);
  assert.equal(docsOnly(["docs/plugins/api.md"]), false);
  assert.equal(docsOnly(["docs/a.md", "scripts/x.mjs"]), false);
  assert.equal(docsOnly([]), false);
  assert.deepEqual(checksFor(["docs/tasks/F1.md"]), { frontend: "docs", rust: false });
  assert.deepEqual(checksFor(["src-tauri/src/lib.rs", "docs/a.md"]), { frontend: "full", rust: true });
  assert.deepEqual(checksFor(null), { frontend: "full", rust: true });
});

test("passed trees are remembered per kind, newest first, up to a limit", () => {
  let passes = recordPass({}, "t1", ["check"], 1);
  passes = recordPass(passes, "t1", ["cargo"], 2);
  assert.deepEqual(passes.t1, { check: 1, cargo: 2 });
  for (let i = 0; i < 45; i += 1) passes = recordPass(passes, `x${i}`, ["check"], 10 + i);
  assert.equal(Object.keys(passes).length, 40);
  assert.equal(passes.t1, undefined);
  assert.ok(passes.x44);
});

test("commits carrying a Claude attribution line are caught", () => {
  const commits = [
    { subject: "feat: a", body: "feat: a\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" },
    { subject: "fix: b", body: "fix: b\n\nCo-Authored-By: Louis <x@y.z>" },
    { subject: "docs: c", body: "docs: c\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)" },
  ];
  assert.deepEqual(attributedCommits(commits), ["feat: a", "docs: c"]);
});

test("cargo test runs only when a landing touches what the Rust side reads", () => {
  assert.equal(needsRust(["src/App.tsx", "docs/plugins/README.md"]), false);
  assert.equal(needsRust(["src-tauri/src/lib.rs"]), true);
  assert.equal(needsRust(["src-tauri/src/agent_status/hooks/focusd-agent-status.ps1"]), true);
  assert.equal(needsRust(["scripts/release/release.mjs"]), false);
  assert.equal(needsRust(["plugins/index.json"]), true);
  assert.equal(needsRust([]), false);
});
