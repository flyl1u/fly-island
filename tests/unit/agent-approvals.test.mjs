import assert from "node:assert/strict";
import test from "node:test";
import { alwaysAllowRule, approvalPreview } from "../../src/features/agent-status/approvals/preview.ts";

test("a shell command shows the command and the agent's note", () => {
  assert.deepEqual(approvalPreview({ command: "npm test", description: "Run the tests" }), {
    kind: "command",
    text: "npm test",
    note: "Run the tests",
  });
});

test("a Codex command list is joined into one line", () => {
  assert.equal(approvalPreview({ command: ["git", "status", "--short"] }).text, "git status --short");
});

test("file tools show the path, web tools the address", () => {
  assert.deepEqual(approvalPreview({ file_path: "src/main.tsx", old_string: "a", new_string: "b" }), {
    kind: "file",
    text: "src/main.tsx",
    note: null,
  });
  assert.equal(approvalPreview({ url: "https://example.com", prompt: "x" }).kind, "url");
});

test("other input falls back to its JSON, cut short", () => {
  assert.deepEqual(approvalPreview({ server: "s", args: [1] }), { kind: "input", text: '{"server":"s","args":[1]}', note: null });
  const long = approvalPreview({ data: "x".repeat(2000) });
  assert.ok(long.text.length <= 601 && long.text.endsWith("…"));
  assert.equal(approvalPreview(null).text, "null");
});

test("always allow uses the first addRules suggestion", () => {
  const suggestions = [
    { type: "setMode", mode: "acceptEdits" },
    { type: "addRules", rules: [{ toolName: "Bash", ruleContent: "npm test:*" }], behavior: "allow", destination: "localSettings" },
  ];
  assert.equal(alwaysAllowRule(suggestions), "Bash(npm test:*)");
  assert.equal(alwaysAllowRule([{ type: "addRules", rules: [{ toolName: "WebSearch" }] }]), "WebSearch");
  assert.equal(alwaysAllowRule(undefined), null);
  assert.equal(alwaysAllowRule([{ type: "setMode", mode: "plan" }]), null);
});

test("approval settings: both switches off by default, old saved settings keep working", async () => {
  const { normalizeAgentApprovalSettings } = await import("../../src/features/agent-status/approvals/storage.ts");
  assert.deepEqual(normalizeAgentApprovalSettings(null), { onIsland: false, whenInFront: false });
  assert.deepEqual(normalizeAgentApprovalSettings({ onIsland: true }), { onIsland: true, whenInFront: false });
  assert.deepEqual(normalizeAgentApprovalSettings({ onIsland: true, whenInFront: true }), { onIsland: true, whenInFront: true });
});
