import { useRef, type ReactNode } from "react";
import { Archive, ArrowDownUp, Bell, Bot, Minus, RotateCcw, Settings } from "lucide-react";
import claudeCodeIcon from "../../assets/brands/claude-code.png";
import { useTranslation } from "../../i18n";
import { QuotaRings } from "../agent-status/AgentQuotaRings";
import { PageButtonContent } from "./PageButtonContent";
import { PAGE_ICONS } from "./pageIcons";
import { usePageButtonLabels } from "./usePageButtonLabels";
import type { PageButtonStyle, PageDot } from "./types";
import "./AgentPagePreview.css";

/** Product names, the same in every language. */
const SAMPLE_MODEL = "Opus 5.5 · Xhigh";
const SAMPLE_TOOL = "PowerShell";
/** Percent left of the 5-hour (outer ring) and 7-day (inner) windows. */
const SAMPLE_QUOTAS = [
  { agent: "claude", outer: 84, inner: 41 },
  { agent: "codex", outer: 93, inner: 92 },
] as const;
const SAMPLE_TOOL_DETAIL = "pnpm verify";
const HEADER_BUTTONS = [Settings, Bell, RotateCcw, Minus];
const LABELED_HEADER_BUTTONS = [ArrowDownUp, Settings, Minus];

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
 * window buttons), the quota rings and the Agent page's list view, laid out as on the island
 * (IslandHeader, AgentQuotaRings, AgentSessionsPanel) with sample sessions.
 */
export function AgentPagePreview({ pageOrder, pageButtonStyle }: { pageOrder: PageDot[]; pageButtonStyle: PageButtonStyle }) {
  const t = useTranslation();
  const showIcons = pageButtonStyle !== "capsule";
  const labeled = pageButtonStyle === "iconLabel";
  const dotsRef = useRef<HTMLSpanElement>(null);
  const labelRowProps = usePageButtonLabels(dotsRef, labeled, "agents");
  const pageClass = labeled ? "agent-page-preview__page agent-page-preview__page--icon-label" : "agent-page-preview__page";
  const { sessions } = t.settings.appearance.preview;
  const { phase } = t.agent;
  const { justNow, minutesAgo, yourTurn } = t.agent.sessions;
  return (
    <div className="agent-page-preview" aria-hidden="true">
      <span className={labeled ? "agent-page-preview__header agent-page-preview__header--icon-label" : "agent-page-preview__header"}>
        {!labeled && (showIcons
          ? <Bot className="agent-page-preview__light" size={16} strokeWidth={1.5} absoluteStrokeWidth />
          : <span className="agent-page-preview__light agent-page-preview__light--capsule" />)}
        <span
          className={labeled ? "agent-page-preview__dots agent-page-preview__dots--icon-label" : "agent-page-preview__dots"}
          ref={dotsRef}
          {...labelRowProps}
        >
          {labeled && (
            <span className={`${pageClass} agent-page-preview__page--agents`} data-page-button="agents" data-page-button-current="">
              <PageButtonContent icon={<Bot size={16} strokeWidth={1.5} absoluteStrokeWidth />} label={t.island.agentPage} />
            </span>
          )}
          {pageOrder.map((page) => {
            const Icon = PAGE_ICONS[page];
            return (
              <span key={page} className={`${pageClass} agent-page-preview__page--${page}`} data-page-button={labeled ? page : undefined}>
                {showIcons ? <PageButtonContent
                  icon={<Icon size={16} strokeWidth={1.5} absoluteStrokeWidth />}
                  label={labeled ? t.island.pageNames[page] : undefined}
                /> : <span />}
              </span>
            );
          })}
          {labeled && (
            <span className={`${pageClass} agent-page-preview__page--messages`} data-page-button="qq">
              <PageButtonContent icon={<Bell size={16} strokeWidth={1.5} absoluteStrokeWidth />} label={t.messages.title} />
            </span>
          )}
        </span>
        <span className="agent-page-preview__buttons">
          {(labeled ? LABELED_HEADER_BUTTONS : HEADER_BUTTONS).map((Icon, index) => (
            <span key={index} className="agent-page-preview__button"><Icon size={10} strokeWidth={2} /></span>
          ))}
        </span>
      </span>

      <span className="agent-page-preview__usage">
        {SAMPLE_QUOTAS.map(({ agent, outer, inner }) => (
          <span key={agent} className={`agent-page-preview__quota agent-page-preview__quota--${agent}`}>
            <QuotaRings outer={outer} inner={inner} provider={agent === "claude" ? "claudeCode" : "codex"} />
          </span>
        ))}
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
