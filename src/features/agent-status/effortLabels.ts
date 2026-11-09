import type { AgentProvider } from "./api";

/**
 * Per agent, effort as reported -> effort as shown, from plugins that declare
 * `contributes.agentEffortLabels`. Mirrors AgentEffortLabels in
 * src-tauri/src/plugin_host/effort_labels.rs; effort names are lower case.
 */
export type AgentEffortLabels = Partial<Record<AgentProvider, Record<string, string>>>;

/** The effort to show for a session: a plugin's label for it, or the effort as reported. */
export function shownEffort(provider: AgentProvider, effort: string | null, labels: AgentEffortLabels): string | null {
  if (!effort) return effort;
  return labels[provider]?.[effort.trim().toLowerCase()] ?? effort;
}
