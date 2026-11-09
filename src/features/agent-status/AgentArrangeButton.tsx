import { useEffect, useRef, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { useTranslation } from "../../i18n";
import { AGENT_SESSION_GROUPS, AGENT_SESSION_SORTS } from "../appearance/settings";
import type { AgentSessionGroup, AgentSessionSort } from "../appearance/types";
import "./AgentArrangeButton.css";

/**
 * The island header's arrange button on the Agent page: a small menu with the list's order and
 * its headings (sessionList.ts arrangeSessions), saved with the settings.
 */
export function AgentArrangeButton({
  sort,
  group,
  onChange,
}: {
  sort: AgentSessionSort;
  group: AgentSessionGroup;
  onChange: (patch: { agentSessionSort?: AgentSessionSort; agentSessionGroup?: AgentSessionGroup }) => void;
}) {
  const text = useTranslation().agent.sessions.arrange;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [open]);

  const row = <T extends string>(title: string, values: readonly T[], labels: Record<T, string>, value: T, pick: (value: T) => void) => (
    <div className="agent-arrange__row" role="radiogroup" aria-label={title}>
      <span className="agent-arrange__title">{title}</span>
      {values.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          className={`agent-arrange__option${option === value ? " agent-arrange__option--on" : ""}`}
          onClick={() => pick(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="agent-arrange" ref={ref} data-window-drag="false">
      <button
        className={`icon-button${open ? " agent-arrange__button--open" : ""}`}
        type="button"
        aria-label={text.label}
        title={text.label}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <ArrowDownUp size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      </button>
      {open && (
        <div className="agent-arrange__menu">
          {row(text.sort, AGENT_SESSION_SORTS, text.sortOptions, sort, (agentSessionSort) => onChange({ agentSessionSort }))}
          {row(text.group, AGENT_SESSION_GROUPS, text.groupOptions, group, (agentSessionGroup) => onChange({ agentSessionGroup }))}
        </div>
      )}
    </div>
  );
}
