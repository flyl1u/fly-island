import { readJson, writeJson } from "../../../lib/storage.ts";
import { AGENT_SOUND_EVENTS, type AgentSoundEvent } from "./events.ts";

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
  events: { start: false, complete: true, error: true, approval: true, question: true, ack: false, compact: true, idle: false, quotaLow: true, quotaReset: true },
  quietWhenInFront: true,
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
};

const CLOCK = /^\d{1,2}:\d{2}$/;

export function normalizeAgentSoundSettings(value: unknown): AgentSoundSettings {
  const fallback = DEFAULT_AGENT_SOUND_SETTINGS;
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const bool = (input: unknown, otherwise: boolean) => (typeof input === "boolean" ? input : otherwise);
  const rawEvents = raw.events && typeof raw.events === "object" ? (raw.events as Record<string, unknown>) : {};
  const rawQuiet = raw.quietHours && typeof raw.quietHours === "object" ? (raw.quietHours as Record<string, unknown>) : {};
  const clock = (input: unknown, otherwise: string) => (typeof input === "string" && CLOCK.test(input) ? input : otherwise);
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    volume: typeof raw.volume === "number" && Number.isFinite(raw.volume) ? Math.min(100, Math.max(0, Math.round(raw.volume))) : fallback.volume,
    pack: typeof raw.pack === "string" && /^[a-z0-9-]{1,64}$/.test(raw.pack) ? raw.pack : fallback.pack,
    events: Object.fromEntries(AGENT_SOUND_EVENTS.map((event) => [event, bool(rawEvents[event], fallback.events[event])])) as Record<AgentSoundEvent, boolean>,
    quietWhenInFront: bool(raw.quietWhenInFront, fallback.quietWhenInFront),
    quietHours: {
      enabled: bool(rawQuiet.enabled, fallback.quietHours.enabled),
      start: clock(rawQuiet.start, fallback.quietHours.start),
      end: clock(rawQuiet.end, fallback.quietHours.end),
    },
  };
}

export function loadAgentSoundSettings(): AgentSoundSettings {
  return normalizeAgentSoundSettings(readJson(AGENT_SOUNDS_STORAGE_KEY));
}

export function saveAgentSoundSettings(settings: AgentSoundSettings) {
  writeJson(AGENT_SOUNDS_STORAGE_KEY, settings);
}
