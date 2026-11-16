import { useEffect, useLayoutEffect, useRef } from "react";
import { agentSessionsInFront, type AgentSessionSummary } from "../api";
import { sessionKey } from "../unseen";
import { announceTiming, emptyAnnounced, isUsersTurn, settledFinishes, settledWaits } from "../announce";
import { soundFor, type AgentSoundEvent } from "./events";
import { hasNewCompletion } from "../completion";
import { compactStarted, emptyIdleSessions, takeIdleSessions } from "./idle";
import { playAgentSound } from "./player";
import type { AgentSoundSettings } from "./storage";
import { useAgentSoundSettings } from "./useAgentSoundSettings";

/** The most important sound wins when several sessions change at once. */
const PRIORITY: AgentSoundEvent[] = ["error", "approval", "question", "complete", "compact", "idle", "start", "ack"];

/** How often finished, unread sessions are checked for the idle sound. */
const IDLE_CHECK_MS = 30_000;

type Seen = { phase: AgentSessionSummary["phase"]; compacting: boolean; completedAt?: number | null };
type Change = { event: AgentSoundEvent; session: AgentSessionSummary };

/**
 * Plays a sound when the user's own task finishes or fails, an agent waits for approval or asks a
 * question, and (when switched on) when a session starts, gets a new prompt, starts compacting or
 * has sat finished and unread (`unseen`) for a while; on its own and apart from the pop-up alerts.
 * A finished turn sounds only once it stays finished, once per typed prompt; a wait only once it
 * lasts, and a session's approvals at most once every two minutes (announce.ts). One sound at a
 * time at most. `canPlay` is false while game mode keeps the island quiet.
 */
export function useAgentSounds(sessions: AgentSessionSummary[], canPlay: boolean, unseen: ReadonlySet<string> = new Set()) {
  const [settings] = useAgentSoundSettings();
  const seenRef = useRef<Map<string, Seen> | null>(null);
  const idleRef = useRef(emptyIdleSessions());
  const announcedRef = useRef(emptyAnnounced());
  const timersRef = useRef(new Set<number>());
  const latest = useRef({ settings, canPlay, sessions, unseen });
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useLayoutEffect(() => {
    latest.current = { settings, canPlay, sessions, unseen };
  });

  useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = new Map(previous);
    for (const session of sessions) {
      const key = sessionKey(session);
      seenRef.current.delete(key);
      seenRef.current.set(key, { phase: session.phase, compacting: session.compacting === true, completedAt: session.lastCompletedAt });
    }
    while (seenRef.current.size > 2048) {
      const key = seenRef.current.keys().next().value;
      if (key === undefined) break;
      seenRef.current.delete(key);
    }
    const changes = sessions.flatMap((session): Change[] => {
      const before = previous?.get(sessionKey(session));
      if (!previous && !hasNewCompletion(undefined, session)) return [];
      const event = soundFor(before?.phase, session.phase, session, before?.completedAt);
      if (event) return [{ event, session }];
      return compactStarted(before?.compacting, session) ? [{ event: "compact", session }] : [];
    });
    const later = (ms: number, play: () => void) => {
      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer);
        play();
      }, ms);
      timersRef.current.add(timer);
    };
    // A turn that ended done or with "your turn"; a wait mid-turn on an approval or a question.
    const finished = changes.filter((change) => (change.event === "complete" || change.event === "question") && change.session.phase === "completed");
    const waits = changes.filter((change) => (change.event === "approval" || change.event === "question") && change.session.phase === "waiting");
    const now = changes.filter((change) => !finished.includes(change) && !waits.includes(change));
    // A failed turn sounds at once, but only when it was the user's own task.
    playOne(now.filter((change) => change.event !== "error" || isUsersTurn(change.session)), () => active.current ? latest.current : null);
    if (finished.length > 0) {
      later(announceTiming.completeMs, () => {
        const settled = settledFinishes(finished.map((change) => change.session), latest.current.sessions, announcedRef.current);
        playOne(finished.filter((change) => settled.includes(change.session)), () => active.current ? latest.current : null);
      });
    }
    if (waits.length > 0) {
      later(announceTiming.waitMs, () => {
        const settled = settledWaits(waits.map((change) => change.session), latest.current.sessions, announcedRef.current, Date.now());
        playOne(waits.filter((change) => settled.includes(change.session)), () => active.current ? latest.current : null);
      });
    }
  }, [sessions]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach((timer) => window.clearTimeout(timer)); timers.clear(); };
  }, []);

  useEffect(() => {
    const check = () => {
      const { sessions: current, unseen: unread } = latest.current;
      const due = takeIdleSessions(idleRef.current, current, unread, Date.now());
      playOne(due.map((session) => ({ event: "idle", session })), () => active.current ? latest.current : null);
    };
    const timer = window.setInterval(check, IDLE_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);
}

/** Plays the most important of `changes` that the settings allow, leaving out sessions in front. */
function playOne(candidates: Change[], current: () => { settings: AgentSoundSettings; canPlay: boolean } | null) {
  const state = current();
  if (!state) return;
  const { settings, canPlay } = state;
  if (!canPlay || !settings.enabled) return;
  const changes = candidates.filter((change) => settings.events[change.event]);
  if (changes.length === 0) return;
  const pick = (from: Change[]) => PRIORITY.map((event) => from.find((change) => change.event === event)).find(Boolean);
  const play = (chosen: Change | undefined) => {
    const state = current();
    if (!chosen || !state?.canPlay) return;
    playAgentSound(chosen.event, state.settings, new Date(), () => {
      const live = current();
      return live?.canPlay === true && live.settings === state.settings;
    });
  };
  // Sounds about the user's own typing (start, a new prompt) are wanted while the terminal is in front.
  const needsCheck = changes.filter((change) => change.event !== "start" && change.event !== "ack");
  if (!settings.quietWhenInFront || needsCheck.length === 0) {
    const chosen = pick(changes);
    play(chosen);
    return;
  }
  void agentSessionsInFront(needsCheck.map((change) => change.session))
    .catch((error: unknown) => {
      console.error("Failed to check which agent windows are in front", error);
      return [] as string[];
    })
    .then((inFront) => {
      const chosen = pick(changes.filter((change) => !inFront.includes(change.session.sessionId)));
      play(chosen);
    });
}
