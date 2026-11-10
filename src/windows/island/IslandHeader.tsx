import { useCallback, type ReactNode } from "react";
import { usePointerReorder } from "../../components/reorder/usePointerReorder";
import type { PageDot } from "../../features/appearance/types";
import { Bell, CircleDot, Languages, Minus, RotateCcw, Settings } from "lucide-react";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { MessageSource } from "../../features/messages/messagePreview";
import { useTranslation } from "../../i18n";
import { isPageEnabled, type IslandFeatures } from "./features";
import type { IslandPage } from "./types";
import "./IslandHeader.css";

type IslandHeaderProps = {
  page: IslandPage;
  features: IslandFeatures;
  /** Order of the page dots; a drag saves a new one. */
  pageOrder: PageDot[];
  onPageOrderChange: (order: PageDot[]) => void;
  showTitle: boolean;
  isDetached: boolean;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  qqNotificationCount: number;
  wechatPending: boolean;
  onPageChange: (page: IslandPage) => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onOpenMessages: (source: MessageSource) => void;
  onOpenTranslator: (() => void) | null;
  onResetPosition: () => void;
  /** False when minimizing tucks the island to the top edge instead. */
  minimizesToTray: boolean;
  onMinimize: () => void;
  /** Buttons of the open page, first among the window actions. */
  pageActions?: ReactNode;
};

/** Header of the expanded island: agent status, page dots, collapse target and window actions. */
export function IslandHeader({
  page,
  features,
  pageOrder,
  onPageOrderChange,
  showTitle,
  isDetached,
  agentVisualState,
  agentStatusLabel,
  qqNotificationCount,
  wechatPending,
  onPageChange,
  onCollapse,
  onOpenSettings,
  onOpenMessages,
  onOpenTranslator,
  onResetPosition,
  minimizesToTray,
  onMinimize,
  pageActions,
}: IslandHeaderProps) {
  const t = useTranslation();
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending);
  // The page dots, in the order the user dragged them into; a dot can be dragged sideways.
  const dots = pageOrder.filter((dot) => features[dot]);
  const dotLabels = { todo: t.island.todoList, music: t.island.music, clipboard: t.island.clipboardHistory, shelf: t.island.shelf };
  const reorderDots = useCallback(
    (next: PageDot[]) => onPageOrderChange([...next, ...pageOrder.filter((dot) => !next.includes(dot))]),
    [onPageOrderChange, pageOrder],
  );
  const { containerRef: dotsRef, itemProps: dotProps, draggingId: draggingDot, wasDragged: wasDotDragged } =
    usePointerReorder(dots, reorderDots, "x");
  const agentStatusIconClassName = [
    "island__agent-status-icon",
    `island__agent-status-icon--${agentVisualState}`,
  ].join(" ");

  return (
    <header className="island__header">
      <div className="island__title">
        {features.agents ? (
          // The status light doubles as the way into the Agent page.
          <button
            className={`island__agent-button${page === "agents" ? " island__agent-button--active" : ""}`}
            type="button"
            aria-label={`${agentStatusLabel} · ${t.agent.sessions.open}`}
            aria-pressed={page === "agents"}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("agents");
            }}
          >
            <CircleDot className={agentStatusIconClassName} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        ) : (
          <CircleDot
            className={agentStatusIconClassName}
            size={16}
            strokeWidth={1.5}
            absoluteStrokeWidth
            aria-label={agentStatusLabel}
          />
        )}
        {showTitle && <span>fly-island</span>}
      </div>

      <div
        className="editor-dots"
        aria-label={t.island.editor}
        ref={(node) => { dotsRef.current = node; }}
      >
        {dots.map((dot) => (
          <button
            key={dot}
            className={[
              "dot-button",
              `dot-button--${dot}`,
              page === dot ? "dot-button--active" : "",
              draggingDot === dot ? "dot-button--dragging" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-label={dotLabels[dot]}
            {...dotProps(dot)}
            onClick={(event) => {
              event.stopPropagation();
              // The click that ends dragging a dot to a new place does not open its page.
              if (!wasDotDragged()) onPageChange(dot);
            }}
          />
        ))}
      </div>

      <button
        className="island__collapse-target"
        type="button"
        aria-label={t.island.collapseIsland}
        data-window-drag="false"
        onClick={onCollapse}
      />

      <div className="window-actions">
        {pageActions}
        <button
          className={`icon-button island-settings-button${page === "settings" ? " island-settings-button--active" : ""}`}
          type="button"
          aria-label={t.settings.title}
          aria-pressed={page === "settings"}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSettings();
          }}
        >
          <Settings size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
        </button>
        {isPageEnabled("qq", features) && <button className={`icon-button island-message-button${page === "qq" ? " island-message-button--active" : ""}`} type="button" aria-label={t.messages.label(messageBadgeLabel)} aria-pressed={page === "qq"} onClick={() => onOpenMessages(wechatPending ? "wechat" : "qq")}>
          <Bell size={16} strokeWidth={1.5} absoluteStrokeWidth />
          {(qqNotificationCount > 0 || wechatPending) && <span className="island-message-button__dot" aria-hidden="true" />}
        </button>}
        {onOpenTranslator && (
          <button
            className={`icon-button island-translate-button${page === "translation" ? " island-translate-button--active" : ""}`}
            type="button"
            aria-label={features.translation ? t.translator.title : t.translator.title}
            aria-pressed={features.translation ? page === "translation" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTranslator();
            }}
          >
            <Languages size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        )}
        {/* Only once the island has been moved: at its default place the button would do nothing. */}
        {isDetached && (
          <button
            className="icon-button island-reset-button island-reset-button--available"
            type="button"
            aria-label={t.island.resetPositionLabel}
            onClick={(event) => {
              event.stopPropagation();
              onResetPosition();
            }}
          >
            <RotateCcw size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          </button>
        )}
        <button
          className="icon-button"
          type="button"
          aria-label={minimizesToTray ? t.island.minimizeToTray : t.island.tuckToTop}
          onClick={(event) => {
            event.stopPropagation();
            onMinimize();
          }}
        >
          <Minus size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
    </header>
  );
}
