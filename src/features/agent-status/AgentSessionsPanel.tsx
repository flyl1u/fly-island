import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import type { AgentHostDisplay } from "../appearance/types";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { focusAgentWindow, type AgentSessionSummary } from "./api";
import { isActivePhase, minutesAgo, modelLabel, sessionProject } from "./sessionList";
import { SessionElapsed } from "./SessionElapsed";
import { SessionHostLabel } from "./SessionHostLabel";
import { AGENT_PROVIDER_LABELS, getAgentPhaseLabel } from "./status";
import "./AgentSessionsPanel.css";

const NOT_FOUND_NOTICE_MS = 3000;
const AGE_REFRESH_MS = 30_000;

/**
 * The island's Agent page: recent sessions; clicking one brings its editor or terminal forward.
 * Sessions still working get a two-line row with the latest reply; finished ones fold to one line.
 */
export function AgentSessionsPanel({
  sessions,
  hostDisplay,
  showElapsed = true,
  showModel = true,
}: {
  sessions: AgentSessionSummary[];
  /** How the program a session runs in is shown; "off" hides it. */
  hostDisplay: AgentHostDisplay;
  showElapsed?: boolean;
  showModel?: boolean;
}) {
  const t = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), AGE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notFoundId) return;
    const timer = window.setTimeout(() => setNotFoundId(null), NOT_FOUND_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notFoundId]);

  const focus = (session: AgentSessionSummary) => {
    setNotFoundId(null);
    void focusAgentWindow(session.provider, session.cwd, session.title, session.sessionId)
      .then((found) => {
        if (!found) setNotFoundId(session.sessionId);
      })
      .catch((error) => {
        console.error("Failed to focus the agent window", error);
        setNotFoundId(session.sessionId);
      });
  };

  if (sessions.length === 0) {
    return (
      <section className="agent-sessions" aria-label={t.agent.sessions.title}>
        <div className="agent-sessions__empty">
          <strong>{t.agent.sessions.empty}</strong>
          <span>{t.agent.sessions.emptyHint}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="agent-sessions" aria-label={t.agent.sessions.title}>
      <ul className="agent-sessions__list">
        {sessions.map((session) => {
          const project = sessionProject(session.cwd);
          const title = session.title ?? project ?? AGENT_PROVIDER_LABELS[session.provider];
          const model = modelLabel(session.model, session.effort);
          const minutes = minutesAgo(session.updatedAt, now);
          const active = isActivePhase(session.phase);
          const phaseLabel = getAgentPhaseLabel(session.phase, t);
          // Running and done are told apart by the dot; the other states need words.
          const showPhase = session.phase !== "running" && session.phase !== "completed";
          const elapsed = showElapsed && session.turnStartedAt !== null;
          // A running session's age is always about now; its running time says more.
          const showAge = session.phase !== "running" || !elapsed;
          const status = [
            showPhase && phaseLabel,
            elapsed && <SessionElapsed key="elapsed" session={session} />,
            showAge && (minutes === 0 ? t.agent.sessions.justNow : t.agent.sessions.minutesAgo(minutes)),
          ]
            .filter(Boolean)
            .flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
          return (
            <li key={`${session.provider}:${session.sessionId}`}>
              <button
                className={`agent-session agent-session--${session.phase} agent-session--${active ? "full" : "compact"}`}
                type="button"
                title={t.agent.sessions.focus(title)}
                onClick={() => focus(session)}
              >
                {active ? (
                  <AgentProviderIcon provider={session.provider} size={18} />
                ) : (
                  <span className="agent-session__dot" title={phaseLabel} aria-hidden="true" />
                )}
                <span className="agent-session__main">
                  <span className="agent-session__heading">
                    <span className="agent-session__title">
                      {project && project !== title ? <span className="agent-session__project">{project} · </span> : null}
                      {title}
                    </span>
                    {active && showModel && model && <span className="agent-session__model">{model}</span>}
                    {!active && <AgentProviderIcon provider={session.provider} size={14} />}
                    {session.host && hostDisplay !== "off" && <SessionHostLabel host={session.host} display={hostDisplay} />}
                    {notFoundId === session.sessionId ? (
                      <span className="agent-session__not-found" role="status">{t.agent.sessions.notFound}</span>
                    ) : (
                      <span className="agent-session__meta">{status}</span>
                    )}
                    {active && <span className="agent-session__dot" title={phaseLabel} aria-hidden="true" />}
                  </span>
                  {active && session.lastMessage && <span className="agent-session__message">{session.lastMessage}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
