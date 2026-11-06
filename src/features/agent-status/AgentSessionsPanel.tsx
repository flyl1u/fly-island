import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n";
import type { AgentHostDisplay } from "../appearance/types";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { AgentUsageBar } from "./AgentUsageBar";
import { focusAgentWindow, type AgentSessionSummary } from "./api";
import { isActivePhase, minutesAgo, modelLabel, sessionProject } from "./sessionList";
import { SessionBody } from "./SessionBody";
import { SessionElapsed } from "./SessionElapsed";
import { SessionHostLabel } from "./SessionHostLabel";
import { AGENT_PROVIDER_LABELS, getAgentPhaseLabel } from "./status";
import { useScrollFade } from "./useScrollFade";
import { sessionKey } from "./unseen";
import type { UnseenSessions } from "./useUnseenSessions";
import type { AlertedSession } from "./useAgentAlerts";
import { AgentApprovalCard } from "./approvals/AgentApprovalCard";
import { AgentQuestionCard } from "./approvals/AgentQuestionCard";
import type { AgentApprovals } from "./approvals/useAgentApprovals";
import "./AgentSessionsPanel.css";

const NOT_FOUND_NOTICE_MS = 3000;
const AGE_REFRESH_MS = 30_000;

/**
 * The island's Agent page: recent sessions; clicking one brings its editor or terminal forward.
 * Sessions still working get a two-line row with the latest reply; finished ones fold to one line,
 * except on an alert's card, where a finished or failed session shows up to three lines of it.
 */
export function AgentSessionsPanel({
  sessions: listed,
  hostDisplay,
  showElapsed = true,
  showModel = true,
  showActivity = true,
  unseen,
  reveal,
  showUsage: usageOn = false,
  approvals,
}: {
  sessions: AgentSessionSummary[];
  /** How the program a session runs in is shown; "off" hides it. */
  hostDisplay: AgentHostDisplay;
  showElapsed?: boolean;
  showModel?: boolean;
  /** The latest prompt and the tool in use, on working rows. */
  showActivity?: boolean;
  /** Finished sessions not looked at yet; they stand out until clicked. */
  unseen?: UnseenSessions;
  /** The session an alert opened the page for; the page then shows it alone, like a card. */
  reveal?: AlertedSession | null;
  /** Claude's usage limits above the list. */
  showUsage?: boolean;
  /** Permission requests agents wait on; the page shows the first one alone. */
  approvals?: AgentApprovals;
}) {
  const t = useTranslation();
  // An alert's session alone, kept current from the list; the list may leave it out (only
  // running sessions listed), and then it shows as the alert saw it.
  const sessions = reveal ? [listed.find((session) => sessionKey(session) === reveal.key) ?? reveal.session] : listed;
  const showUsage = usageOn && !reveal;
  const [now, setNow] = useState(() => Date.now());
  const [notFoundId, setNotFoundId] = useState<string | null>(null);
  // Fade out an end of the list that has more sessions past it, rather than cutting a row in half.
  const list = useScrollFade<HTMLUListElement>(sessions);
  const cardRef = useRef<HTMLLIElement>(null);
  const measure = reveal?.measure;
  const cardKey = reveal?.key;

  // The island fits the card: report its row's height now and whenever it changes (a new reply).
  useLayoutEffect(() => {
    const row = cardRef.current;
    if (!measure || !row) return;
    const report = () => measure(row.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, cardKey]);

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
    unseen?.markSeen(session);
    void focusAgentWindow(session.provider, session.cwd, session.title, session.sessionId)
      .then((found) => {
        if (!found) setNotFoundId(session.sessionId);
      })
      .catch((error) => {
        console.error("Failed to focus the agent window", error);
        setNotFoundId(session.sessionId);
      });
  };

  // A request an agent is waiting on comes before everything else on the page.
  if (approvals?.current) {
    return (
      <section className="agent-sessions" aria-label={t.agent.sessions.title}>
        {approvals.current.kind === "question" ? (
          <AgentQuestionCard approvals={approvals} sessions={listed} />
        ) : (
          <AgentApprovalCard approvals={approvals} sessions={listed} />
        )}
      </section>
    );
  }

  if (sessions.length === 0) {
    return (
      <section className="agent-sessions" aria-label={t.agent.sessions.title}>
        {showUsage && <AgentUsageBar />}
        <div className="agent-sessions__empty">
          <strong>{t.agent.sessions.empty}</strong>
          <span>{t.agent.sessions.emptyHint}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="agent-sessions" aria-label={t.agent.sessions.title}>
      {showUsage && <AgentUsageBar />}
      <ul
        ref={list.ref}
        className="agent-sessions__list"
        data-fade-top={list.fade.top || undefined}
        data-fade-bottom={list.fade.bottom || undefined}
        onScroll={list.onScroll}
      >
        {sessions.map((session) => {
          const project = sessionProject(session.cwd);
          const title = session.title ?? project ?? AGENT_PROVIDER_LABELS[session.provider];
          const model = modelLabel(session.model, session.effort);
          const mode = session.permissionMode && session.permissionMode !== "default" ? t.agent.sessions.permissionModes[session.permissionMode] : null;
          const minutes = minutesAgo(session.updatedAt, now);
          // A working session with nothing to say yet (a turn just started) has no second line.
          const active = isActivePhase(session.phase);
          // On an alert's card a finished or failed session shows its last reply (its summary).
          const cardReply = reveal && !active ? session.lastMessage : null;
          const full = Boolean(cardReply) || (active && Boolean(session.lastMessage || (showActivity && (session.lastPrompt || session.currentTool))));
          const phaseLabel = getAgentPhaseLabel(session.phase, t);
          // Running and done are told apart by the dot; the other states need words.
          const showPhase = session.phase !== "running" && session.phase !== "completed";
          const elapsed = showElapsed && session.turnStartedAt !== null;
          // A running session's age is always about now; its running time says more.
          const showAge = session.phase !== "running" || !elapsed;
          const status = [
            showPhase && phaseLabel,
            elapsed && <SessionElapsed key="elapsed" session={session} />,
            active && session.subagents ? t.agent.sessions.subagents(session.subagents) : null,
            showAge && (minutes === 0 ? t.agent.sessions.justNow : t.agent.sessions.minutesAgo(minutes)),
          ]
            .filter(Boolean)
            .flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
          return (
            <li key={`${session.provider}:${session.sessionId}`} ref={reveal ? cardRef : undefined} data-session-key={sessionKey(session)}>
              <button
                className={`agent-session agent-session--${session.phase} agent-session--${full ? "full" : "compact"}${unseen?.keys.has(sessionKey(session)) ? " agent-session--unseen" : ""}`}
                type="button"
                onClick={() => focus(session)}
              >
                <span className="agent-session__dot" aria-hidden="true" />
                <span className="agent-session__main">
                  <span className="agent-session__heading">
                    <span className="agent-session__title">
                      {project && project !== title ? <span className="agent-session__project">{project} · </span> : null}
                      {title}
                    </span>
                    {active && showModel && model && <span className="agent-session__model">{model}</span>}
                    {active && mode && (
                      <span className={`agent-session__mode agent-session__mode--${session.permissionMode}`}>
                        {mode}
                      </span>
                    )}
                    {notFoundId === session.sessionId ? (
                      <span className="agent-session__not-found" role="status">{isActivePhase(session.phase) ? t.agent.sessions.notFound : t.agent.sessions.notFoundEnded}</span>
                    ) : (
                      <span className="agent-session__meta">{status}</span>
                    )}
                    {session.host && hostDisplay !== "off" && <SessionHostLabel host={session.host} display={hostDisplay} />}
                    {/* With icons only, an unknown host still takes an icon's room, so the host icons
                        form a column too; names differ in width, so there is no column to keep. */}
                    {!session.host && hostDisplay === "icon" && (
                      <span className="agent-session__host agent-session__host--unknown" aria-hidden="true" />
                    )}
                    {/* Last on the line, so the provider icons line up however long the status is. */}
                    <AgentProviderIcon provider={session.provider} size={14} />
                  </span>
                  {cardReply ? (
                    <span className="agent-session__message agent-session__message--card">{cardReply}</span>
                  ) : (
                    full && <SessionBody session={session} showActivity={showActivity} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
