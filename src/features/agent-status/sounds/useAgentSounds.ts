import { useEffect, useLayoutEffect, useRef } from "react";
import { agentSessionsInFront, type AgentSessionSummary } from "../api";
import { sessionKey } from "../unseen";
import { soundFor, type AgentSoundEvent } from "./events";
import { playAgentSound } from "./player";
import { useAgentSoundSettings } from "./useAgentSoundSettings";

/** The most important sound wins when several sessions change at once. */
const PRIORITY: AgentSoundEvent[] = ["error", "approval", "question", "complete", "start", "ack"];

/**
 * Plays a sound when an agent session starts, finishes, fails, waits for approval or asks a
 * question, or gets a new prompt, on its own and apart from the pop-up alerts. One sound per
 * poll at most. `canPlay` is false while game mode keeps the island quiet.
 */
export function useAgentSounds(sessions: AgentSessionSummary[], canPlay: boolean) {
  const [settings] = useAgentSoundSettings();
  const phasesRef = useRef<Map<string, AgentSessionSummary["phase"]> | null>(null);
  const latest = useRef({ settings, canPlay });
  useLayoutEffect(() => {
    latest.current = { settings, canPlay };
  });

  useEffect(() => {
    const previous = phasesRef.current;
    phasesRef.current = new Map(sessions.map((session) => [sessionKey(session), session.phase]));
    // The first look only takes note of where every session stands.
    if (!previous || !latest.current.canPlay || !latest.current.settings.enabled) return;

    const changes = sessions.flatMap((session) => {
      const event = soundFor(previous.get(sessionKey(session)), session.phase, session);
      return event && latest.current.settings.events[event] ? [{ event, session }] : [];
    });
    if (changes.length === 0) return;

    const pick = (candidates: typeof changes) =>
      PRIORITY.map((event) => candidates.find((change) => change.event === event)).find(Boolean);
    // Sounds about the user's own typing (start, a new prompt) are wanted while the terminal is in front.
    const needsCheck = changes.filter((change) => change.event !== "start" && change.event !== "ack");
    if (!latest.current.settings.quietWhenInFront || needsCheck.length === 0) {
      const chosen = pick(changes);
      if (chosen) playAgentSound(chosen.event, latest.current.settings);
      return;
    }
    void agentSessionsInFront(needsCheck.map((change) => change.session))
      .catch((error: unknown) => {
        console.error("Failed to check which agent windows are in front", error);
        return [] as string[];
      })
      .then((inFront) => {
        const chosen = pick(changes.filter((change) => !inFront.includes(change.session.sessionId)));
        if (chosen && latest.current.canPlay) playAgentSound(chosen.event, latest.current.settings);
      });
  }, [sessions]);
}
