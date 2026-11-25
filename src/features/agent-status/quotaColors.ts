import type { AgentProvider } from "./api";

/**
 * Each source's ring colour as the hover card's title and a card's dot show it: the ring's own
 * `--quota-base` (AgentQuotaRings.css) a quarter of the way toward the text colour. Claude's clay,
 * Codex's blue, WorkBuddy's teal and DSH's rose, apart from one another on the dark island.
 */
export const QUOTA_COLORS: Record<AgentProvider, string> = {
  claudeCode: "#e5a385", codex: "#6ea8fe", dsh: "#ea84b1", workbuddy: "#71c8bc", plugin: "#71c8bc",
  // Kimi Code's violet, Z Code's amber and Antigravity's mint; Cursor, CodeBuddy and Hermes have no rings, only card dots.
  kimiCode: "#a89df8", zcode: "#e5b869", antigravity: "#8fd6a2", cursor: "#d6d4ce", codebuddy: "#8f7bff", hermes: "#c9bbff",
};
