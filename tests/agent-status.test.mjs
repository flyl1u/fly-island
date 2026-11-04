import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AGENT_STATUS,
  getAgentPhaseLabel,
  getAgentStatusLabel,
  getAgentVisualState,
  isAgentAttentionPhase,
} from "../src/features/agent-status/status.ts";
import { TRANSLATIONS } from "../src/i18n/index.ts";

const t = TRANSLATIONS.en;
const snapshot = (codex, claudeCode) => ({
  ...DEFAULT_AGENT_STATUS,
  codex: { phase: codex, updatedAt: 1 },
  claudeCode: { phase: claudeCode, updatedAt: 1 },
});

test("failed and stale phases need attention", () => {
  assert.equal(isAgentAttentionPhase("failed"), true);
  assert.equal(isAgentAttentionPhase("stale"), true);
  for (const phase of ["idle", "running", "completed"]) {
    assert.equal(isAgentAttentionPhase(phase), false, phase);
  }
});

test("attention outranks running, which outranks idle", () => {
  assert.equal(getAgentVisualState(DEFAULT_AGENT_STATUS), "idle");
  assert.equal(getAgentVisualState(snapshot("completed", "idle")), "idle");
  assert.equal(getAgentVisualState(snapshot("running", "idle")), "running");
  assert.equal(getAgentVisualState(snapshot("running", "failed")), "attention");
  assert.equal(getAgentVisualState(snapshot("stale", "running")), "attention");
});

test("the status label names the provider that needs attention or is running", () => {
  assert.equal(getAgentStatusLabel(DEFAULT_AGENT_STATUS, t), t.agent.idleOrDone);
  assert.equal(getAgentStatusLabel(snapshot("running", "idle"), t), t.agent.running("Codex"));
  assert.equal(getAgentStatusLabel(snapshot("running", "failed"), t), t.agent.failed("Claude Code"));
  assert.equal(getAgentStatusLabel(snapshot("stale", "failed"), t), t.agent.stale("Codex"));
});

test("phase labels fall back to idle for unknown phases", () => {
  assert.equal(getAgentPhaseLabel("running", t), t.agent.phase.running);
  assert.equal(getAgentPhaseLabel("completed", t), t.agent.phase.completed);
  assert.equal(getAgentPhaseLabel("unknown", t), t.agent.phase.idle);
});

test("reported sources light the island and are named in the label", () => {
  const withOther = (phase) => ({
    ...snapshot("idle", "idle"),
    others: [{ id: "dev.example.cursor/cursor", name: "Cursor", phase, updatedAt: 1 }],
  });
  assert.equal(getAgentVisualState(withOther("running")), "running");
  assert.equal(getAgentVisualState(withOther("stale")), "attention");
  assert.equal(getAgentStatusLabel(withOther("running"), t), t.agent.running("Cursor"));
  assert.equal(getAgentStatusLabel(withOther("failed"), t), t.agent.failed("Cursor"));
  // Snapshots from older builds have no `others`.
  const { others: _ignored, ...older } = withOther("running");
  assert.equal(getAgentVisualState(older), "idle");
});
