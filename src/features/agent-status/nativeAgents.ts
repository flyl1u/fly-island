import { useMemo } from "react";
import type { IslandSettings } from "../appearance/types";
import { useNativePlugins } from "../plugins";
import type { NativeAgentProvider } from "./api";

export type NativeAgentSettings = Pick<IslandSettings, "agentShowCursor" | "agentShowKimiCode" | "agentShowHermes" | "agentShowZcode" | "agentShowAntigravity">;

/** The plugin-market agents, by the ids the market and its settings use. */
export type MarketAgentProvider = Exclude<NativeAgentProvider, "antigravity">;

/** The agents from the plugin market and the setting that shows each, in the settings page's order. */
export const NATIVE_AGENTS: readonly { id: MarketAgentProvider; setting: keyof NativeAgentSettings; sessions: boolean; quota: boolean }[] = [
  { id: "cursor", setting: "agentShowCursor", sessions: true, quota: false },
  { id: "kimiCode", setting: "agentShowKimiCode", sessions: true, quota: true },
  { id: "zcode", setting: "agentShowZcode", sessions: false, quota: true },
  { id: "hermes", setting: "agentShowHermes", sessions: true, quota: false },
];

/**
 * Which of them the island shows, plus Antigravity, which ships with the island: it appears as soon
 * as its own data is on this computer and needs no installing.
 */
export function useNativeAgents(settings: NativeAgentSettings): Record<NativeAgentProvider, boolean> {
  const installed = useNativePlugins();
  const { agentShowCursor, agentShowKimiCode, agentShowHermes, agentShowZcode, agentShowAntigravity } = settings;
  return useMemo(() => ({
    cursor: installed.cursor && agentShowCursor,
    kimiCode: installed.kimiCode && agentShowKimiCode,
    hermes: installed.hermes && agentShowHermes,
    zcode: installed.zcode && agentShowZcode,
    antigravity: agentShowAntigravity,
  }), [installed.cursor, installed.kimiCode, installed.hermes, installed.zcode,
    agentShowCursor, agentShowKimiCode, agentShowHermes, agentShowZcode, agentShowAntigravity]);
}

/** The agents read from another program's files: the market ones above, then Antigravity. */
export const SESSION_SOURCES: readonly { id: NativeAgentProvider; setting: keyof NativeAgentSettings; sessions: boolean; quota: boolean }[] = [
  ...NATIVE_AGENTS,
  { id: "antigravity", setting: "agentShowAntigravity", sessions: true, quota: true },
];
/** The ones whose sessions the native side should read, as `list_agent_sessions` takes them. */
export function nativeSessionSources(shown: Record<NativeAgentProvider, boolean>): NativeAgentProvider[] {
  return SESSION_SOURCES.filter((agent) => agent.sessions && shown[agent.id]).map((agent) => agent.id);
}
