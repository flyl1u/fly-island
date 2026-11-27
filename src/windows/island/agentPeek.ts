import type { AgentSession, RunningAgent } from "../../features/agent-status/session";

/** How long a newly started agent task shows over a manual choice: the maintainer asked for 2–3 seconds. */
export const AGENT_PEEK_MS = 2500;
/** More tasks starting meanwhile restart the clock, but one peek never lasts longer than this. */
export const AGENT_PEEK_MAX_MS = 5000;

export type AgentPeek = { key: string; session: AgentSession; startedAt: number; endsAt: number };

/**
 * The newest of the sessions that started running since `previous`, or null. Only the change from
 * not running to running counts, so a task that keeps running never starts a second peek.
 */
export function newlyStartedAgent(previous: ReadonlySet<string>, running: readonly RunningAgent[]) {
  let newest: RunningAgent | null = null;
  for (const agent of running) {
    if (!previous.has(agent.key) && (!newest || agent.startedAt > newest.startedAt)) newest = agent;
  }
  return newest;
}

/**
 * The peek after the running sessions changed. `allowed` is false while the collapsed text is not
 * ours to change (open, tucked, a message or alert in its place); a start met then is not replayed.
 * A peek only begins over a manual choice of something other than the agent, but one already
 * running goes on even if that choice stops being available.
 */
export function advanceAgentPeek(
  peek: AgentPeek | null,
  started: RunningAgent | null,
  { now, allowed, overChoice }: { now: number; allowed: boolean; overChoice: boolean },
): AgentPeek | null {
  if (!allowed) return null;
  const current = peek && now < peek.endsAt ? peek : null;
  if (!started?.session || !(current || overChoice)) return current;
  const startedAt = current?.startedAt ?? now;
  return { key: started.key, session: started.session, startedAt, endsAt: Math.min(now + AGENT_PEEK_MS, startedAt + AGENT_PEEK_MAX_MS) };
}
