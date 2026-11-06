import { invoke } from "@tauri-apps/api/core";

/**
 * Asks Anthropic for fresh usage now, when the usage ring's "ask Anthropic directly" is on;
 * otherwise, within a minute of the last request or during a 429 cooldown it does nothing.
 * Read the result with getAgentUsage.
 */
export function refreshClaudeUsage() {
  return invoke<void>("refresh_claude_usage");
}
