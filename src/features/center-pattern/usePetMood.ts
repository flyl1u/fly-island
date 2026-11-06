import { useEffect, useMemo, useState } from "react";
import { petMoodChangesAt, petMoodFor, type AgentActivity } from "./centerSettings";
import type { PetMood } from "./patterns";

/** The pet's mood for these agents, re-checked when a finished agent's wave runs out. */
export function usePetMood(agents: readonly AgentActivity[], enabled: boolean): PetMood {
  const [now, setNow] = useState(() => Date.now());

  // New data is the moment phases changed, so measure the wave from here. Not while off: the
  // agents change every poll, and each change would re-render the caller for nothing.
  useEffect(() => {
    if (enabled) setNow(Date.now());
  }, [agents, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const changesAt = petMoodChangesAt(agents, now);
    if (changesAt === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, changesAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [agents, enabled, now]);

  return useMemo(() => (enabled ? petMoodFor(agents, now) : "idle"), [agents, enabled, now]);
}
