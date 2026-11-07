import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { ArchivedNotice } from "./ArchivedNotice";
import { useArchiveMotion } from "./useArchiveMotion";
import { useTranslation } from "../../i18n";
import type { AgentArchiveMotion, AgentHostDisplay, AgentSessionView } from "../appearance/types";
import { AgentSessionCard } from "./AgentSessionCard";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { AgentUsageBar } from "./AgentUsageBar";
import type { AgentUsages } from "./usage";
import { focusAgentWindow, type AgentSessionSummary } from "./api";
import { groupByComputer, isActivePhase, minutesAgo, modelLabel, sessionProject } from "./sessionList";
import { shownEffort } from "./effortLabels";
import { useEffortLabels } from "./useEffortLabels";
import { SessionBody } from "./SessionBody";
import { SessionElapsed } from "./SessionElapsed";
import { SessionHostLabel } from "./SessionHostLabel";
import { AGENT_PROVIDER_LABELS, getAgentPhaseLabel } from "./status";
import { useScrollFade } from "./useScrollFade";
import { asksUser, sessionKey } from "./unseen";
import { sessionLight } from "./sessionLight";
import type { UnseenSessions } from "./useUnseenSessions";
import type { SessionRemoval } from "./useHiddenSessions";
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
  view = "list",
  archiveMotion = "slide",
  hostDisplay,
  showElapsed = true,
  showModel = true,
  showActivity = true,
  unseen,
  removal,
  reveal,
  showUsage: usageOn = false,
  usages,
  approvals,
}: {
  sessions: AgentSessionSummary[];
  /** Flat rows (the default), cards framed in their light, or one-line rows (AgentSessionCard). */
  view?: AgentSessionView;
  /** How an archived session leaves: sliding out, or dissolving into dust (useArchiveMotion). */
  archiveMotion?: AgentArchiveMotion;
  /** How the program a session runs in is shown; "off" hides it. */
  hostDisplay: AgentHostDisplay;
  showElapsed?: boolean;
  showModel?: boolean;
  /** The latest prompt and the tool in use, on working rows. */
  showActivity?: boolean;
  /** Finished sessions not looked at yet; they stand out until clicked. */
  unseen?: UnseenSessions;
  /** Removing a session from the page (an x at a row's right end), and undoing it. */
  removal?: SessionRemoval;
  /** The session an alert opened the page for; the page then shows it alone, like a card. */
  reveal?: AlertedSession | null;
  /** Claude's and Codex's usage limits above the list. */
  showUsage?: boolean;
  /** Those limits as the island read them; without them the usage lines read their own. */
  usages?: AgentUsages;
  /** Permission requests agents wait on; the page shows the first one alone. */
  approvals?: AgentApprovals;
}) {
  const t = useTranslation();
  // An alert's session alone, kept current from the list; the list may leave it out (only
  // running sessions listed), and then it shows as the alert saw it.
  const sessions = reveal ? [listed.find((session) => sessionKey(session) === reveal.key) ?? reveal.session] : listed;
  const showUsage = usageOn && !reveal;
  const [now, setNow] = useState(() => Date.now());
  const effortLabels = useEffortLabels();
  const [notFoundId, setNotFoundId] = useState<string | null>(null);
  // Fade out an end of the list that has more sessions past it, rather than cutting a row in half.
  const list = useScrollFade<HTMLUListElement>(sessions);
  const motion = useArchiveMotion(list.element, removal, archiveMotion);
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
    // A session on another computer runs in a terminal tab or editor window connected to it
    // (a WezTerm SSH tab, VS Code Remote): found by title and folder only, as its process and
    // session id mean nothing here.
    void focusAgentWindow(session.provider, session.cwd, session.title, session.remoteHost ? "" : session.sessionId)
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

  const removedNotice = removal && !reveal && <ArchivedNotice removed={removal.removed} onUndo={motion.undo} />;

  if (sessions.length === 0) {
    return (
      <section className="agent-sessions" aria-label={t.agent.sessions.title}>
        {showUsage && <AgentUsageBar usages={usages} />}
        <div className="agent-sessions__empty">
          <strong>{t.agent.sessions.empty}</strong>
          <span>{t.agent.sessions.emptyHint}</span>
        </div>
        {removedNotice}
      </section>
    );
  }

  return (
    <section className="agent-sessions" aria-label={t.agent.sessions.title}>
      {showUsage && <AgentUsageBar usages={usages} />}
      <ul
        ref={list.ref}
        className={`agent-sessions__list${view === "list" ? "" : ` agent-sessions__list--${view}`}${removal && !reveal ? " agent-sessions__list--archivable" : ""}`}
        data-fade-top={list.fade.top || undefined}
        data-fade-bottom={list.fade.bottom || undefined}
        onScroll={list.onScroll}
      >
        {groupByComputer(sessions).flatMap(({ host, sessions: members }, _, groups) => [
          // Headings only once another computer is listed (never on an alert's card).
          !reveal && (groups.length > 1 || host !== null) ? (
            <li key={`computer:${host ?? ""}`} className="agent-sessions__computer" aria-hidden="true">
              {host ?? t.agent.sessions.thisComputer}
            </li>
          ) : null,
          ...members.map((session) => {
          const project = sessionProject(session.cwd);
          const title = session.title ?? project ?? AGENT_PROVIDER_LABELS[session.provider];
          const model = modelLabel(session.model, shownEffort(session.provider, session.effort, effortLabels));
          const mode = session.permissionMode && session.permissionMode !== "default" ? t.agent.sessions.permissionModes[session.permissionMode] : null;
          const key = sessionKey(session);
          const notFound = notFoundId === session.sessionId
            ? session.remoteHost ? t.agent.sessions.remoteOnly(session.remoteHost) : isActivePhase(session.phase) ? t.agent.sessions.notFound : t.agent.sessions.notFoundEnded
            : null;
          // Right of the provider icon, grey, shown while the cursor is on the row: some sessions
          // never report that they ended. A session that writes again comes back by itself.
          const archive = removal && !reveal && (
            <button className="agent-session__archive" type="button" aria-label={t.agent.sessions.remove(title)} title={t.agent.sessions.remove(title)} onClick={() => motion.archive(session)}>
              <Archive size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          );
          if (view !== "list") {
            return (
              <li key={`${session.provider}:${session.sessionId}`} ref={reveal ? cardRef : undefined} data-session-key={key}>
                <AgentSessionCard
                  session={session}
                  now={now}
                  compact={view === "compact"}
                  hostDisplay={hostDisplay}
                  showElapsed={showElapsed}
                  showActivity={showActivity}
                  model={showModel ? model : null}
                  unseen={Boolean(unseen?.keys.has(key))}
                  looked={Boolean(unseen && !unseen.keys.has(key) && asksUser(session))}
                  notFound={notFound}
                  cardReply={reveal && !isActivePhase(session.phase) ? session.lastMessage : null}
                  onOpen={() => focus(session)}
                />
                {archive}
              </li>
            );
          }
          const minutes = minutesAgo(session.updatedAt, now);
          // A working session with nothing to say yet (a turn just started) has no second line.
          const active = isActivePhase(session.phase);
          // On an alert's card a finished or failed session shows its last reply (its summary).
          const cardReply = reveal && !active ? session.lastMessage : null;
          const full = Boolean(cardReply) || (active && Boolean(session.lastMessage || (showActivity && (session.lastPrompt || session.currentTool))));
          // A finished turn that asked something (the marker, or a reply ending in a question).
          const light = sessionLight(session);
          const yourTurn = light === "yourTurn";
          const phaseLabel = session.compacting ? t.agent.sessions.compacting : yourTurn ? t.agent.sessions.yourTurn : getAgentPhaseLabel(session.phase, t);
          // Running and done are told apart by the dot; the other states need words.
          const showPhase = session.compacting || yourTurn || (session.phase !== "running" && session.phase !== "completed");
          const elapsed = showElapsed && session.turnStartedAt !== null;
          // A running session's age is always about now; its running time says more.
          const showAge = session.phase !== "running" || !elapsed;
          const status = [
            showPhase && phaseLabel,
            elapsed && <SessionElapsed key="elapsed" session={session} />,
            active && session.subagents ? t.agent.sessions.subagents(session.subagents) : null,
            session.todos && (
              <span key="todos" className="agent-session__todos" title={session.todos.current ? t.agent.sessions.todosCurrent(session.todos.current) : undefined}>
                {t.agent.sessions.todos(session.todos.done, session.todos.total)}
              </span>
            ),
            session.backgroundTasks ? t.agent.sessions.backgroundTasks(session.backgroundTasks) : null,
            showAge && (minutes === 0 ? t.agent.sessions.justNow : t.agent.sessions.minutesAgo(minutes)),
          ]
            .filter(Boolean)
            .flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));
          return (
            <li key={`${session.provider}:${session.sessionId}`} ref={reveal ? cardRef : undefined} data-session-key={sessionKey(session)}>
              <button
                className={`agent-session agent-session--${session.phase} agent-session--light-${light} agent-session--${full ? "full" : "compact"}${unseen?.keys.has(sessionKey(session)) ? " agent-session--unseen" : unseen && asksUser(session) ? " agent-session--looked" : ""}`}
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
                    {notFound ? (
                      <span className="agent-session__not-found" role="status">{notFound}</span>
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
              {archive}
            </li>
          );
          }),
        ])}
      </ul>
      {removedNotice}
    </section>
  );
}
