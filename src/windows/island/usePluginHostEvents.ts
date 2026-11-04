import { useEffect, useRef } from "react";
import type { AgentStatusSnapshot } from "../../features/agent-status/api";
import { listAgentStatuses } from "../../features/agent-status/status";
import { emitPluginHostEvent, type PluginHostEventName } from "../../features/plugins/api";
import { useLocale } from "../../i18n";
import type { IslandMode } from "./types";

type PluginHostEventSources = {
  date: string;
  /** Any value whose identity changes when the day's todos, the later list or the active todo change. */
  todosVersion: readonly unknown[];
  note: string;
  agentStatus: AgentStatusSnapshot;
  mode: IslandMode;
};

/**
 * Reports changes plugins can subscribe to (events.subscribe) to the plugin host.
 * Nothing is sent for the first render: plugins read the current state themselves.
 */
export function usePluginHostEvents({ date, todosVersion, note, agentStatus, mode }: PluginHostEventSources) {
  const { locale } = useLocale();
  useChangeEvent("todos.changed", [date, ...todosVersion], () => ({ date }));
  useChangeEvent("note.changed", [date, note], () => ({ date }));
  useChangeEvent("agentStatus.changed", [agentStatus], () => ({
    agents: listAgentStatuses(agentStatus).map(({ key, label, status }) => ({
      id: key,
      name: label,
      phase: status.phase,
      ...(status.title ? { title: status.title } : {}),
    })),
  }));
  useChangeEvent(mode === "expanded" ? "island.expanded" : "island.collapsed", [mode === "expanded"], () => ({}));
  useChangeEvent("app.locale.changed", [locale], () => ({ locale }));
}

function useChangeEvent(name: PluginHostEventName, deps: readonly unknown[], payload: () => Record<string, unknown>) {
  const previous = useRef<readonly unknown[] | null>(null);
  const latestPayload = useRef(payload);
  latestPayload.current = payload;
  useEffect(() => {
    const before = previous.current;
    previous.current = deps;
    if (before === null || (before.length === deps.length && before.every((value, index) => Object.is(value, deps[index])))) {
      return;
    }
    void emitPluginHostEvent(name, latestPayload.current()).catch((error: unknown) => {
      console.error("Failed to report a plugin host event", error);
    });
  });
}
