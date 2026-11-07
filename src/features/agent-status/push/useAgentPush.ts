import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "../../../i18n";
import { detectAlerts, phasesOf, type SessionPhases } from "../alerts";
import type { AgentSessionSummary } from "../api";
import { sessionProject } from "../sessionList";
import { AGENT_PROVIDER_LABELS } from "../status";
import { getUserIdleSeconds, sendBarkPush } from "./api";
import { useAgentPushSettings } from "./useAgentPushSettings";

/** Groups the pushes on the phone. */
export const PUSH_GROUP = "FocuSD Island";
/** More than this many at once (the island just woke up, say) is noise; the newest go. */
const MAX_PUSHES = 3;

/**
 * Sends a push to the phone (Bark, roadmap B6.5.5) when a session waits for the user, finishes or
 * fails, if those are switched on; with `awayMinutes`, only after that long without keyboard or
 * mouse input. The push names the session and what happened, never a command or a reply.
 * `enabled` is false while the AI Agent switch is off.
 */
export function useAgentPush(sessions: AgentSessionSummary[], enabled: boolean) {
  const [settings] = useAgentPushSettings();
  const text = useTranslation().agent.push;
  const phasesRef = useRef<SessionPhases | null>(null);
  const latest = useRef({ settings, text, enabled });
  useLayoutEffect(() => {
    latest.current = { settings, text, enabled };
  });

  useEffect(() => {
    const previous = phasesRef.current;
    phasesRef.current = phasesOf(sessions, previous);
    const { settings: push, text: labels, enabled: on } = latest.current;
    if (!on || !push.enabled) return;
    const alerts = detectAlerts(previous, sessions, { started: "off", ...push.events }).slice(-MAX_PUSHES);
    if (alerts.length === 0) return;

    const send = () => {
      for (const { kind, session } of alerts) {
        if (kind === "started") continue;
        const title = session.title ?? sessionProject(session.cwd) ?? AGENT_PROVIDER_LABELS[session.provider];
        void sendBarkPush(push.server, title, labels[kind](AGENT_PROVIDER_LABELS[session.provider]), PUSH_GROUP).catch((error: unknown) =>
          console.error("Failed to push to the phone", error),
        );
      }
    };
    if (push.awayMinutes === 0) return send();
    void getUserIdleSeconds()
      .catch(() => null)
      .then((idle) => {
        // Unknown idle time pushes: better a push too many than one missed while away.
        if (idle === null || idle >= push.awayMinutes * 60) send();
      });
  }, [sessions]);
}
