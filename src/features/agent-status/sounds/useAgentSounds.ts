import { useEffect, useLayoutEffect, useRef } from "react";
import { agentSessionsInFront, type AgentSessionSummary } from "../api";
import { sessionKey } from "../unseen";
import { soundFor, type AgentSoundEvent } from "./events";
import { compactStarted, emptyIdleSessions, takeIdleSessions } from "./idle";
import { playAgentSound } from "./player";
import type { AgentSoundSettings } from "./storage";
import { useAgentSoundSettings } from "./useAgentSoundSettings";

/** The most important sound wins when several sessions change at once. */
const PRIORITY: AgentSoundEvent[] = ["error", "approval", "question", "complete", "compact", "idle", "start", "ack"];

/** How often finished, unread sessions are checked for the idle sound. */
const IDLE_CHECK_MS = 30_000;

type Seen = { phase: AgentSessionSummary["phase"]; compacting: boolean };
type Change = { event: AgentSoundEvent; session: AgentSessionSummary };

/**
 * Plays a sound when an agent session starts, finishes, fails, waits for approval or asks a
 * question, gets a new prompt or starts compacting its context, and when a finished session has
 * sat unread (`unseen`) for a while; on its own and apart from the pop-up alerts. One sound per
 * poll at most. `canPlay` is false while game mode keeps the island quiet.
 */
export function useAgentSounds(sessions: AgentSessionSummary[], canPlay: boolean, unseen: ReadonlySet<string> = new Set()) {
  const [settings] = useAgentSoundSettings();
  const seenRef = useRef<Map<string, Seen> | null>(null);
  const idleRef = useRef(emptyIdleSessions());
  const latest = useRef({ settings, canPlay, sessions, unseen });
  useLayoutEffect(() => {
    latest.current = { settings, canPlay, sessions, unseen };
  });

  useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = new Map(sessions.map((session) => [sessionKey(session), { phase: session.phase, compacting: session.compacting === true }]));
    // The first look only takes note of where every session stands.
    if (!previous) return;
    const changes = sessions.flatMap((session): Change[] => {
      const before = previous.get(sessionKey(session));
      const event = soundFor(before?.phase, session.phase, session);
      if (event) return [{ event, session }];
      return compactStarted(before?.compacting, session) ? [{ event: "compact", session }] : [];
    });
    playOne(changes, latest.current);
  }, [sessions]);

  useEffect(() => {
    const check = () => {
      const { sessions: current, unseen: unread } = latest.current;
      const due = takeIdleSessions(idleRef.current, current, unread, Date.now());
      playOne(due.map((session) => ({ event: "idle", session })), latest.current);
    };
    const timer = window.setInterval(check, IDLE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
}

/** Plays the most important of `changes` that the settings allow, leaving out sessions in front. */
function playOne(candidates: Change[], { settings, canPlay }: { settings: AgentSoundSettings; canPlay: boolean }) {
  if (!canPlay || !settings.enabled) return;
  const changes = candidates.filter((change) => settings.events[change.event]);
  if (changes.length === 0) return;
  const pick = (from: Change[]) => PRIORITY.map((event) => from.find((change) => change.event === event)).find(Boolean);
  // Sounds about the user's own typing (start, a new prompt) are wanted while the terminal is in front.
  const needsCheck = changes.filter((change) => change.event !== "start" && change.event !== "ack");
  if (!settings.quietWhenInFront || needsCheck.length === 0) {
    const chosen = pick(changes);
    if (chosen) playAgentSound(chosen.event, settings);
    return;
  }
  void agentSessionsInFront(needsCheck.map((change) => change.session))
    .catch((error: unknown) => {
      console.error("Failed to check which agent windows are in front", error);
      return [] as string[];
    })
    .then((inFront) => {
      const chosen = pick(changes.filter((change) => !inFront.includes(change.session.sessionId)));
      if (chosen) playAgentSound(chosen.event, settings);
    });
}
