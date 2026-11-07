import { readJson, writeJson } from "../../../lib/storage.ts";

export const AGENT_PUSH_STORAGE_KEY = "focusd-island-agent-push";

/** What a session did that can go to the phone. */
export const AGENT_PUSH_EVENTS = ["waiting", "completed", "failed"] as const;
export type AgentPushEvent = (typeof AGENT_PUSH_EVENTS)[number];

/** Push only after this many minutes without keyboard or mouse input; 0 pushes always. */
export const AGENT_PUSH_AWAY_MINUTES = [0, 2, 5, 10] as const;

export type AgentPushSettings = {
  enabled: boolean;
  /** A bark-server's address; empty is Bark's own (https://api.day.app). */
  server: string;
  events: Record<AgentPushEvent, boolean>;
  awayMinutes: number;
};

export const DEFAULT_AGENT_PUSH_SETTINGS: AgentPushSettings = {
  enabled: false,
  server: "",
  events: { waiting: true, completed: true, failed: true },
  // Pushing to the phone while sitting at the computer is noise.
  awayMinutes: 5,
};

export function normalizeAgentPushSettings(value: unknown): AgentPushSettings {
  const fallback = DEFAULT_AGENT_PUSH_SETTINGS;
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const rawEvents = raw.events && typeof raw.events === "object" ? (raw.events as Record<string, unknown>) : {};
  const bool = (input: unknown, otherwise: boolean) => (typeof input === "boolean" ? input : otherwise);
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    server: typeof raw.server === "string" ? raw.server.trim().slice(0, 200) : fallback.server,
    events: Object.fromEntries(AGENT_PUSH_EVENTS.map((event) => [event, bool(rawEvents[event], fallback.events[event])])) as Record<AgentPushEvent, boolean>,
    awayMinutes: (AGENT_PUSH_AWAY_MINUTES as readonly unknown[]).includes(raw.awayMinutes) ? (raw.awayMinutes as number) : fallback.awayMinutes,
  };
}

export function loadAgentPushSettings(): AgentPushSettings {
  return normalizeAgentPushSettings(readJson(AGENT_PUSH_STORAGE_KEY));
}

export function saveAgentPushSettings(settings: AgentPushSettings) {
  writeJson(AGENT_PUSH_STORAGE_KEY, settings);
}
