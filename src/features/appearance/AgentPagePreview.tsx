import type { ReactNode } from "react";
import { Archive, Bell, CircleDot, Languages, ListChecks, Minus, RotateCcw, Settings } from "lucide-react";
import claudeCodeIcon from "../../assets/brands/claude-code.png";
import { useTranslation } from "../../i18n";
import "./AgentPagePreview.css";

/** Product names, the same in every language. */
const SAMPLE_MODEL = "Opus 5.5 · Xhigh";
const SAMPLE_TOOL = "PowerShell";
const SAMPLE_TOOL_DETAIL = "pnpm verify";
const PAGE_DOTS = ["todo", "music", "calendar", "clipboard", "shelf"] as const;
const HEADER_BUTTONS = [Settings, Bell, Languages, RotateCcw, Minus];

function ClaudeIcon() {
  return <img className="agent-page-preview__provider" src={claudeCodeIcon} alt="" draggable={false} />;
}

function Row({ light, project, title, status, model, below }: {
  light: "needs" | "your-turn" | "done";
  project: string;
  title: string;
  status: string;
  model?: string;
  /** The working line under the title, on a session mid-turn. */
  below?: ReactNode;
}) {
  return (
    <span className={`agent-page-preview__row agent-page-preview__row--${light}`}>
      <span className="agent-page-preview__dot" />
      <span className="agent-page-preview__main">
        <span className="agent-page-preview__heading">
          <span className="agent-page-preview__title">{project} · {title}</span>
          {model && <span className="agent-page-preview__model">{model}</span>}
          <span className="agent-page-preview__status">{status}</span>
          <ClaudeIcon />
          <Archive className="agent-page-preview__archive" size={9} strokeWidth={2} />
        </span>
        {below}
      </span>
    </span>
  );
}

/**
 * The expanded island in the appearance preview, drawn small: the header (Agent light, page dots,
 * window buttons), the usage line and the Agent page's list view, laid out as on the island
 * (IslandHeader, AgentUsageBar, AgentSessionsPanel) with sample sessions.
 */
export function AgentPagePreview() {
  const t = useTranslation();
  const { sessions } = t.settings.appearance.preview;
  const { usage, phase } = t.agent;
  const { justNow, minutesAgo, yourTurn } = t.agent.sessions;
  return (
    <div className="agent-page-preview" aria-hidden="true">
      <span className="agent-page-preview__header">
        <CircleDot className="agent-page-preview__light" size={11} strokeWidth={1.5} absoluteStrokeWidth />
        <span className="agent-page-preview__dots">
          {PAGE_DOTS.map((page) => <span key={page} className={`agent-page-preview__page agent-page-preview__page--${page}`} />)}
          <ListChecks size={10} strokeWidth={2} />
        </span>
        <span className="agent-page-preview__buttons">
          {HEADER_BUTTONS.map((Icon, index) => (
            <span key={index} className="agent-page-preview__button"><Icon size={10} strokeWidth={2} /></span>
          ))}
        </span>
      </span>

      <span className="agent-page-preview__usage">
        <ClaudeIcon />
        <span>{usage.fiveHour} <b className="agent-page-preview__usage-low">4%</b></span>
        <span className="agent-page-preview__usage-rule" />
        <span>{usage.sevenDay} <b className="agent-page-preview__usage-mid">59%</b></span>
        <span className="agent-page-preview__usage-reset">{usage.resetsIn({ days: 4, hours: 16, minutes: 0 })}</span>
      </span>

      <span className="agent-page-preview__list">
        <Row
          light="needs"
          {...sessions.needs}
          status={`${phase.waiting} · ${justNow}`}
          model={SAMPLE_MODEL}
          below={(
            <span className="agent-page-preview__tool">
              <span className="agent-page-preview__tool-name">{SAMPLE_TOOL}</span> {SAMPLE_TOOL_DETAIL}
            </span>
          )}
        />
        <Row light="your-turn" {...sessions.yourTurn} status={`${yourTurn} · ${justNow}`} />
        <Row light="done" {...sessions.done} status={minutesAgo(16)} />
      </span>
    </div>
  );
}
