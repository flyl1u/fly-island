import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useTranslation } from "../../i18n";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { focusAgentWindow, type AgentSessionSummary } from "./api";
import { minutesAgo, modelLabel, sessionProject } from "./sessionList";
import { AGENT_PROVIDER_LABELS, getAgentPhaseLabel } from "./status";
import "./AgentSessionsPanel.css";

const NOT_FOUND_NOTICE_MS = 3000;
const AGE_REFRESH_MS = 30_000;

/** The island's Agent page: recent sessions; clicking one brings its editor or terminal forward. */
export function AgentSessionsPanel({ sessions }: { sessions: AgentSessionSummary[] }) {
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

  return (
    <section className="agent-sessions" aria-label={t.agent.sessions.title}>
      <header className="agent-sessions__header">
        <Bot size={15} strokeWidth={2.2} aria-hidden="true" />
        <span>{t.agent.sessions.title}</span>
        <span className="agent-sessions__count">{sessions.length}</span>
      </header>
      {sessions.length === 0 ? (
        <div className="agent-sessions__empty">
          <strong>{t.agent.sessions.empty}</strong>
          <span>{t.agent.sessions.emptyHint}</span>
        </div>
      ) : (
        <ul className="agent-sessions__list">
          {sessions.map((session) => {
            const project = sessionProject(session.cwd);
            const title = session.title ?? project ?? AGENT_PROVIDER_LABELS[session.provider];
            const model = modelLabel(session.model, session.effort);
            const minutes = minutesAgo(session.updatedAt, now);
            return (
              <li key={`${session.provider}:${session.sessionId}`}>
                <button
                  className={`agent-session agent-session--${session.phase}`}
                  type="button"
                  title={t.agent.sessions.focus(title)}
                  onClick={() => focus(session)}
                >
                  <AgentProviderIcon provider={session.provider} size={18} />
                  <span className="agent-session__main">
                    <span className="agent-session__heading">
                      <span className="agent-session__title">
                        {project && project !== title ? <span className="agent-session__project">{project} · </span> : null}
                        {title}
                      </span>
                      {model && <span className="agent-session__model">{model}</span>}
                      <span className="agent-session__dot" aria-hidden="true" />
                    </span>
                    {session.lastMessage && <span className="agent-session__message">{session.lastMessage}</span>}
                    <span className="agent-session__meta">
                      {notFoundId === session.sessionId ? (
                        <span className="agent-session__not-found" role="status">{t.agent.sessions.notFound}</span>
                      ) : (
                        <>
                          {getAgentPhaseLabel(session.phase, t)} · {minutes === 0 ? t.agent.sessions.justNow : t.agent.sessions.minutesAgo(minutes)}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
