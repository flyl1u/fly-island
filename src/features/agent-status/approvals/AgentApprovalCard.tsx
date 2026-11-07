import { useEffect, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { AgentProviderIcon } from "../AgentProviderIcon";
import { focusAgentWindow, type AgentSessionSummary } from "../api";
import { sessionProject } from "../sessionList";
import { AGENT_PROVIDER_LABELS } from "../status";
import { APPROVAL_HOTKEYS, type AgentApprovalDecision } from "./api";
import type { AgentApprovals } from "./useAgentApprovals";
import { useApprovalCard } from "./useApprovalCard";
import { alwaysAllowRule, approvalPreview } from "./preview";
import "./AgentApprovalCard.css";

export { APPROVAL_ARM_MS } from "./useApprovalCard";

/**
 * A permission request an agent waits on: what it wants to run, and deny / allow / always /
 * back to the terminal. Shown alone on the Agent page while it lasts.
 */
export function AgentApprovalCard({ approvals, sessions }: { approvals: AgentApprovals; sessions: AgentSessionSummary[] }) {
  const t = useTranslation();
  const request = approvals.current;
  const [expanded, setExpanded] = useState(false);
  const id = request?.id;
  // Keys answer the card only once it is armed, and only while it shows.
  const { armed, cardRef, actRef } = useApprovalCard(approvals, APPROVAL_HOTKEYS);

  useEffect(() => {
    setExpanded(false);
  }, [id]);

  if (!request) return null;
  const labels = t.agent.approval;
  const session = sessions.find((item) => item.provider === request.agent && item.sessionId === request.sessionId);
  const cwd = session?.cwd ?? request.cwd;
  const project = sessionProject(cwd);
  const title = session?.title ?? project ?? AGENT_PROVIDER_LABELS[request.agent];
  const preview = approvalPreview(request.toolInput);
  const rule = request.agent === "claudeCode" ? alwaysAllowRule(request.permissionSuggestions) : null;

  const toTerminal = () => {
    approvals.decide("terminal");
    // A remote session has no window here by its id; one connected to that computer may be found by folder and title.
    void focusAgentWindow(request.agent, cwd, session?.title ?? null, request.remoteHost ? "" : request.sessionId).catch((error: unknown) =>
      console.error("Failed to focus the agent window", error),
    );
  };
  actRef.current = (action) => {
    if (action === "terminal") toTerminal();
    else if (action !== "allowAlways" || rule) approvals.decide(action);
  };
  const keyOf = (action: AgentApprovalDecision) => APPROVAL_HOTKEYS.find((hotkey) => hotkey.action === action)?.shortcut;

  return (
    <section ref={cardRef} className="agent-approval" role="alertdialog" aria-label={`${title} · ${labels.label(request.toolName)}`} key={request.id}>
      <header className="agent-approval__heading">
        <ShieldQuestion className="agent-approval__icon" size={14} strokeWidth={2.3} aria-hidden="true" />
        <span className="agent-approval__title">
          {request.remoteHost ? <span className="agent-approval__project">{request.remoteHost} · </span> : null}
          {project && project !== title ? <span className="agent-approval__project">{project} · </span> : null}
          {title}
        </span>
        <span className="agent-approval__meta">
          {labels.label(request.toolName)}
          {approvals.queued > 0 && ` · ${labels.more(approvals.queued)}`}
        </span>
        <AgentProviderIcon provider={request.agent} size={14} />
      </header>
      {preview.note && <p className="agent-approval__note">{preview.note}</p>}
      <button
        className={`agent-approval__preview agent-approval__preview--${preview.kind}${expanded ? " agent-approval__preview--expanded" : ""}`}
        type="button"
        aria-expanded={expanded}
        title={expanded ? labels.collapse : labels.expand}
        onClick={() => setExpanded((value) => !value)}
      >
        {preview.text}
      </button>
      <div className="agent-approval__actions">
        <button className="agent-approval__button agent-approval__button--terminal" type="button" disabled={!armed} title={`${labels.terminalHint} (${keyOf("terminal")})`} onClick={toTerminal}>
          {labels.terminal}
        </button>
        <button className="agent-approval__button agent-approval__button--deny" type="button" disabled={!armed} title={keyOf("deny")} onClick={() => approvals.decide("deny")}>
          {labels.deny}
        </button>
        {rule && (
          <button className="agent-approval__button" type="button" disabled={!armed} title={labels.allowAlwaysHint(rule)} onClick={() => approvals.decide("allowAlways")}>
            {labels.allowAlways}
          </button>
        )}
        <button className="agent-approval__button agent-approval__button--allow" type="button" disabled={!armed} title={keyOf("allow")} onClick={() => approvals.decide("allow")}>
          {labels.allow}
        </button>
      </div>
    </section>
  );
}
