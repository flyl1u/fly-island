// The built-in plugin `focusd.center-pattern` (manifest in src-tauri/src/plugin_host/builtin.rs):
// reading its settings, the pet a session's agents act out, and the pet list for its page.
import type { PetInfo } from "./api";
import { CENTER_PATTERNS, type CenterPatternId, type PetMood } from "./patterns.ts";

export const CENTER_PATTERN_PLUGIN_ID = "focusd.center-pattern";
/** The plugin's string setting holding a pet's id; its page shows it as a list of pets. */
export const CENTER_PATTERN_PET_KEY = "pet";
/** How long a pet keeps waving after an agent finished (matches the island's held title). */
export const PET_DONE_HOLD_MS = 3000;

export type CenterPatternChoice = { pattern: CenterPatternId; petId: null } | { pattern: "pet"; petId: string };

/** What the plugin's settings ask for; anything unknown falls back to the eyes. */
export function centerPatternChoice(settings: Record<string, unknown>): CenterPatternChoice {
  const pattern = settings.pattern;
  const petId = typeof settings[CENTER_PATTERN_PET_KEY] === "string" ? (settings[CENTER_PATTERN_PET_KEY] as string).trim() : "";
  if (pattern === "pet") return petId ? { pattern: "pet", petId } : { pattern: "eyes", petId: null };
  return { pattern: CENTER_PATTERNS.find((known) => known === pattern) ?? "eyes", petId: null };
}

/** A session or a reported agent, as far as the pet cares. */
export type AgentActivity = { phase: string; updatedAt: number };

/**
 * What the pet acts out for the agents: waiting for the user beats running, running beats
 * failed or possibly stopped (stale), and an agent that finished under `PET_DONE_HOLD_MS` ago
 * gets a wave; otherwise idle.
 */
export function petMoodFor(agents: readonly AgentActivity[], now: number): PetMood {
  const phases = new Set(agents.map((agent) => agent.phase));
  if (phases.has("waiting")) return "waiting";
  if (phases.has("running")) return "running";
  if (phases.has("failed") || phases.has("stale")) return "failed";
  return agents.some((agent) => agent.phase === "completed" && isFresh(agent, now)) ? "done" : "idle";
}

/** When the next wave ends (the mood may change then), or null when none is under way. */
export function petMoodChangesAt(agents: readonly AgentActivity[], now: number): number | null {
  const ends = agents
    .filter((agent) => agent.phase === "completed" && isFresh(agent, now))
    .map((agent) => agent.updatedAt + PET_DONE_HOLD_MS);
  return ends.length > 0 ? Math.min(...ends) : null;
}

function isFresh(agent: AgentActivity, now: number) {
  return now - agent.updatedAt < PET_DONE_HOLD_MS && now >= agent.updatedAt;
}

/** The pets on disk as the plugin page knows them: still reading, unreadable, or the list. */
export type PetList = readonly PetInfo[] | "loading" | "failed";

/**
 * The pet list for the plugin page: an empty "none chosen" entry first (it says why when there
 * is nothing to pick), every pet found, and the saved one marked missing when it is gone.
 * While the list loads, only the saved value, labelled as loading.
 */
export function petChoices(
  pets: PetList,
  current: string,
  labels: { unset: string; none: string; failed: string; loading: string; missing: (id: string) => string; app: string },
): { value: string; label: string }[] {
  if (pets === "loading") return [{ value: current, label: labels.loading }];
  const list = pets === "failed" ? [] : pets;
  const unset = pets === "failed" ? labels.failed : list.length > 0 ? labels.unset : labels.none;
  const choices = [{ value: "", label: unset }];
  for (const pet of list)
    choices.push({ value: pet.id, label: pet.source === "app" ? `${pet.displayName} · ${labels.app}` : pet.displayName });
  if (current && !list.some((pet) => pet.id === current))
    choices.push({ value: current, label: pets === "failed" ? current : labels.missing(current) });
  return choices;
}
