import { useEffect, useMemo, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { AgentProviderIcon } from "../AgentProviderIcon";
import { focusAgentWindow, type AgentSessionSummary } from "../api";
import { sessionProject } from "../sessionList";
import { AGENT_PROVIDER_LABELS } from "../status";
import { APPROVAL_HOTKEYS } from "./api";
import type { AgentApprovals } from "./useAgentApprovals";
import { useApprovalCard } from "./useApprovalCard";
import { answerOf, answersFor, answersOnPick, EMPTY_PICK, parseQuestions, togglePick, type QuestionPick } from "./questions";
import "./AgentApprovalCard.css";
import "./AgentQuestionCard.css";

/** Only "back to the terminal" is system-wide here; number keys work while the island has the focus. */
const QUESTION_HOTKEYS = APPROVAL_HOTKEYS.filter((hotkey) => hotkey.action === "terminal");

/**
 * A question Claude Code asks with AskUserQuestion, answered on the island: a lone single-select
 * question answers on the first pick (a click or its number key); otherwise the user ticks or
 * types and presses Submit. Typed text is sent as the answer as is. Shown alone on the Agent page.
 */
export function AgentQuestionCard({ approvals, sessions }: { approvals: AgentApprovals; sessions: AgentSessionSummary[] }) {
  const t = useTranslation();
  const request = approvals.current;
  const id = request?.id;
  const questions = useMemo(() => parseQuestions(request?.toolInput), [request?.toolInput]);
  const [picks, setPicks] = useState<QuestionPick[]>([]);
  const { armed, cardRef, actRef } = useApprovalCard(approvals, QUESTION_HOTKEYS);

  useEffect(() => {
    setPicks([]);
  }, [id]);

  const session = request && sessions.find((item) => item.provider === request.agent && item.sessionId === request.sessionId);
  const cwd = session?.cwd ?? request?.cwd ?? null;
  const answers = answersFor(questions, picks);
  const instant = answersOnPick(questions);

  const toTerminal = () => {
    if (!request) return;
    approvals.decide("terminal");
    // A remote session has no window here by its id; one connected to that computer may be found by folder and title.
    void focusAgentWindow(request.agent, cwd, session?.title ?? null, request.remoteHost ? "" : request.sessionId).catch((error: unknown) =>
      console.error("Failed to focus the agent window", error),
    );
  };
  actRef.current = (action) => {
    if (action === "terminal") toTerminal();
  };

  const update = (index: number, change: (pick: QuestionPick) => QuestionPick) =>
    setPicks((current) => questions.map((_, at) => (at === index ? change(current[at] ?? EMPTY_PICK) : current[at] ?? EMPTY_PICK)));
  const pick = (index: number, label: string) => {
    if (!armed) return;
    if (instant) {
      approvals.decide("answer", { [questions[0].question]: label });
      return;
    }
    update(index, (current) => togglePick(current, questions[index], label));
  };
  const submit = () => {
    if (armed && answers) approvals.decide("answer", answers);
  };

  // Number keys pick an option of the first question still open (or the first one); the listener
  // is renewed every render, so it always sees the current picks.
  const activeIndex = Math.max(0, questions.findIndex((_, index) => !answerOf(picks[index])));
  useEffect(() => {
    if (!armed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && event.target.matches("input, textarea")) return;
      const digit = Number(event.key);
      const option = questions[activeIndex]?.options[digit - 1];
      if (!Number.isInteger(digit) || !option) return;
      event.preventDefault();
      pick(activeIndex, option.label);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!request) return null;
  const labels = t.agent.question;
  const project = sessionProject(cwd);
  const title = session?.title ?? project ?? AGENT_PROVIDER_LABELS[request.agent];

  return (
    <section ref={cardRef} className="agent-approval agent-question" role="alertdialog" aria-label={`${title} · ${labels.label}`} key={request.id}>
      <header className="agent-approval__heading">
        <MessageCircleQuestion className="agent-approval__icon" size={14} strokeWidth={2.3} aria-hidden="true" />
        <span className="agent-approval__title">
          {request.remoteHost ? <span className="agent-approval__project">{request.remoteHost} · </span> : null}
          {project && project !== title ? <span className="agent-approval__project">{project} · </span> : null}
          {title}
        </span>
        <span className="agent-approval__meta">
          {labels.label}
          {approvals.queued > 0 && ` · ${t.agent.approval.more(approvals.queued)}`}
        </span>
        <AgentProviderIcon provider={request.agent} size={14} />
      </header>
      {questions.map((question, index) => {
        const current = picks[index] ?? EMPTY_PICK;
        return (
          <fieldset key={question.question} className="agent-question__item">
            <legend className="agent-question__text">
              {question.header && <span className="agent-question__header">{question.header}</span>}
              {question.question}
            </legend>
            <div className="agent-question__options" role={question.multiSelect ? "group" : "radiogroup"}>
              {question.options.map((option, at) => {
                const chosen = current.labels.includes(option.label);
                return (
                  <button
                    key={option.label}
                    className={`agent-question__option${chosen ? " agent-question__option--chosen" : ""}`}
                    type="button"
                    role={question.multiSelect ? "checkbox" : "radio"}
                    aria-checked={chosen}
                    disabled={!armed}
                    title={option.description || undefined}
                    onClick={() => pick(index, option.label)}
                  >
                    {index === activeIndex && at < 9 && <span className="agent-question__key" aria-hidden="true">{at + 1}</span>}
                    {option.label}
                  </button>
                );
              })}
            </div>
            <input
              className="agent-question__other"
              type="text"
              value={current.text}
              placeholder={labels.other}
              aria-label={`${question.question} · ${labels.other}`}
              onChange={(event) => update(index, (pick) => ({ ...pick, text: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
          </fieldset>
        );
      })}
      <div className="agent-approval__actions">
        <button
          className="agent-approval__button agent-approval__button--terminal"
          type="button"
          disabled={!armed}
          title={`${t.agent.approval.terminalHint} (${QUESTION_HOTKEYS[0]?.shortcut ?? ""})`}
          onClick={toTerminal}
        >
          {t.agent.approval.terminal}
        </button>
        {(!instant || picks.some((item) => item?.text.trim())) && (
          <button className="agent-approval__button agent-approval__button--allow" type="button" disabled={!armed || !answers} onClick={submit}>
            {labels.submit}
          </button>
        )}
      </div>
    </section>
  );
}
