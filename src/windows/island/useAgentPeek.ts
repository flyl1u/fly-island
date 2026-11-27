import { useEffect, useRef, useState } from "react";
import type { AgentSession, RunningAgent } from "../../features/agent-status/session";
import { advanceAgentPeek, newlyStartedAgent, type AgentPeek } from "./agentPeek";

/**
 * The agent session to show over the user's wheel choice for a moment, after a task starts
 * running (agentPeek.ts). `cancel` ends it early; the choice itself is never touched here.
 */
export function useAgentPeek(running: readonly RunningAgent[], { allowed, overChoice }: { allowed: boolean; overChoice: boolean }) {
  const [peek, setPeek] = useState<AgentPeek | null>(null);
  const seen = useRef<ReadonlySet<string>>(new Set<string>());

  useEffect(() => {
    const started = newlyStartedAgent(seen.current, running);
    seen.current = new Set(running.map((agent) => agent.key));
    setPeek((current) => advanceAgentPeek(current, started, { now: Date.now(), allowed, overChoice }));
    // `overChoice` alone starts nothing: a start is only met when `running` changes.
  }, [running, allowed, overChoice]);

  useEffect(() => {
    if (!peek) return;
    const timer = window.setTimeout(() => setPeek(null), Math.max(0, peek.endsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [peek]);

  // `allowed` also hides it in the very render that takes the text away.
  const shown: AgentSession | null = allowed && peek
    ? running.find((agent) => agent.key === peek.key)?.session ?? peek.session
    : null;
  return { peekedAgent: shown, cancelAgentPeek: () => setPeek(null) };
}
