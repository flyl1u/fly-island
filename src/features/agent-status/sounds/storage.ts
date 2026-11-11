import { readJson, writeJson } from "../../../lib/storage.ts";
import type { AgentSoundEvent } from "./events.ts";

export const AGENT_SOUNDS_STORAGE_KEY = "focusd-island-agent-sounds";

/** The sounds that ship with the island; any other value is an imported pack's id. */
export const BUILTIN_PACK = "builtin";

export type AgentSoundSettings = {
  enabled: boolean;
  /** 0-100. */
  volume: number;
  /** BUILTIN_PACK or an imported pack's id. */
  pack: string;
  events: Record<AgentSoundEvent, boolean>;
  /** Stay quiet while the session's terminal or window is in front. */
  quietWhenInFront: boolean;
  quietHours: { enabled: boolean; start: string; end: string };
};

export const DEFAULT_AGENT_SOUND_SETTINGS: AgentSoundSettings = {
  enabled: true,
  volume: 70,
  pack: BUILTIN_PACK,
  // Starting a session and sending a prompt happen at the keyboard; a sound there is opt-in.
  // A finished session left unread is highlighted on the Agent page already; its sound is opt-in too.
  // Only a task's end (done or failed) and a wait on the user sound: compacting and quota changes
  // are steps along the way, and the quota alert still pops up on the island.
  events: { start: false, complete: true, error: true, approval: true, question: true, ack: false, compact: false, idle: false, quotaLow: false, quotaReset: false },
  quietWhenInFront: true,
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
};

/**
 * Saved sound settings. Only the on/off switch is still a setting; the volume, pack, events and
 * quiet times always load as their defaults, whatever an older version saved.
 */
export function normalizeAgentSoundSettings(value: unknown): AgentSoundSettings {
  const fallback = DEFAULT_AGENT_SOUND_SETTINGS;
  const enabled = value && typeof value === "object" ? (value as Record<string, unknown>).enabled : undefined;
  return { ...fallback, enabled: typeof enabled === "boolean" ? enabled : fallback.enabled };
}

export function loadAgentSoundSettings(): AgentSoundSettings {
  return normalizeAgentSoundSettings(readJson(AGENT_SOUNDS_STORAGE_KEY));
}

export function saveAgentSoundSettings(settings: AgentSoundSettings) {
  writeJson(AGENT_SOUNDS_STORAGE_KEY, settings);
}
