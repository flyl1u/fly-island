import { useMemo } from "react";
import type { IslandSettings } from "../appearance/types";
import { useNativePlugins } from "../plugins";
import type { NativeAgentProvider } from "./api";

export type NativeAgentSettings = Pick<IslandSettings, "agentShowCursor" | "agentShowKimiCode" | "agentShowHermes" | "agentShowZcode">;

/** The plugin-market agents and the setting that shows each, in the settings page's order. */
export const NATIVE_AGENTS: readonly { id: NativeAgentProvider; setting: keyof NativeAgentSettings; sessions: boolean; quota: boolean }[] = [
  { id: "cursor", setting: "agentShowCursor", sessions: true, quota: false },
  { id: "kimiCode", setting: "agentShowKimiCode", sessions: true, quota: true },
  { id: "zcode", setting: "agentShowZcode", sessions: false, quota: true },
  { id: "hermes", setting: "agentShowHermes", sessions: true, quota: false },
];

/** Which of them the island shows: installed in the plugin market and switched on in settings. */
export function useNativeAgents(settings: NativeAgentSettings): Record<NativeAgentProvider, boolean> {
  const installed = useNativePlugins();
  const { agentShowCursor, agentShowKimiCode, agentShowHermes, agentShowZcode } = settings;
  return useMemo(() => ({
    cursor: installed.cursor && agentShowCursor,
    kimiCode: installed.kimiCode && agentShowKimiCode,
    hermes: installed.hermes && agentShowHermes,
    zcode: installed.zcode && agentShowZcode,
  }), [installed.cursor, installed.kimiCode, installed.hermes, installed.zcode, agentShowCursor, agentShowKimiCode, agentShowHermes, agentShowZcode]);
}

/** The ones whose sessions the native side should read, as `list_agent_sessions` takes them. */
export function nativeSessionSources(shown: Record<NativeAgentProvider, boolean>): NativeAgentProvider[] {
  return NATIVE_AGENTS.filter((agent) => agent.sessions && shown[agent.id]).map((agent) => agent.id);
}
