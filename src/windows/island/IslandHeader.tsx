import { useCallback, type ReactNode } from "react";
import { usePointerReorder } from "../../components/reorder/usePointerReorder";
import { PAGE_ICONS } from "../../features/appearance/pageIcons";
import type { PageButtonStyle, PageDot } from "../../features/appearance/types";
import { Bell, Bot, CircleDot, Minus, RotateCcw, Settings } from "lucide-react";
import type { AgentVisualState } from "../../features/agent-status/status";
import { useCommunityInvite } from "../../features/updater/useCommunityInvite";
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
  pageButtonStyle: PageButtonStyle;
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
  /** Opens translation (its island page or its own window); null when translation is off. */
  onOpenTranslator: (() => void) | null;
  onResetPosition: () => void;
  /** False when minimizing tucks the island to the top edge instead. */
  minimizesToTray: boolean;
  onMinimize: () => void;
  /** Buttons of the open page, first among the window actions. */
  pageActions?: ReactNode;
};

/**
 * Header of the expanded island: agent status, page dots (translation among them), collapse
 * target and window actions.
 */
export function IslandHeader({
  page,
  features,
  pageOrder,
  pageButtonStyle,
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
  // A red dot leads to the community group in About until it has been opened.
  const communityPending = useCommunityInvite().pending;
  const showIcons = pageButtonStyle === "icon";
  const AgentIcon = showIcons ? Bot : CircleDot;
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending);
  // The page dots, in the order the user dragged them into; a dot can be dragged sideways.
  // Translation has one while it is on, also when it opens in its own window.
  const dots = pageOrder.filter((dot) => (dot === "translation" ? onOpenTranslator !== null : features[dot]));
  const dotLabels = {
    todo: t.island.todoList,
    music: t.island.music,
    clipboard: t.island.clipboardHistory,
    shelf: t.island.shelf,
    translation: t.translator.title,
  };
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
            data-tip={t.island.agentPage}
            aria-label={`${agentStatusLabel} · ${t.agent.sessions.open}`}
            aria-pressed={page === "agents"}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("agents");
            }}
          >
            <AgentIcon className={agentStatusIconClassName} size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
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
        {dots.map((dot) => {
          const Icon = PAGE_ICONS[dot];
          return (
            <button
              key={dot}
              className={[
                "dot-button",
                `dot-button--${dot}`,
                showIcons ? "dot-button--icon" : "dot-button--capsule",
                page === dot ? "dot-button--active" : "",
                draggingDot === dot ? "dot-button--dragging" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-label={dotLabels[dot]}
              aria-current={page === dot ? "page" : undefined}
              data-tip={t.island.pageNames[dot]}
              {...dotProps(dot)}
              onClick={(event) => {
                event.stopPropagation();
                // The click that ends dragging a dot to a new place does not open its page.
                if (wasDotDragged()) return;
                if (dot === "translation") onOpenTranslator?.();
                else onPageChange(dot);
              }}
            >
              {showIcons && <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
            </button>
          );
        })}
        {/* Messages sit with the page buttons, after the draggable ones; they are not reordered. */}
        {isPageEnabled("qq", features) && (
          <button
            className={[
              "dot-button",
              "dot-button--messages",
              showIcons ? "dot-button--icon" : "dot-button--capsule",
              page === "qq" ? "dot-button--active" : "",
            ].filter(Boolean).join(" ")}
            type="button"
            aria-label={t.messages.label(messageBadgeLabel)}
            aria-pressed={page === "qq"}
            data-tip={t.messages.title}
            onClick={(event) => {
              event.stopPropagation();
              onOpenMessages(wechatPending ? "wechat" : "qq");
            }}
          >
            {showIcons && <Bell size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
            {(qqNotificationCount > 0 || wechatPending) && <span className="island-message-button__dot" aria-hidden="true" />}
          </button>
        )}
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
          aria-label={communityPending ? t.island.settingsWithNews : t.settings.title}
          aria-pressed={page === "settings"}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSettings();
          }}
        >
          <Settings size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          {communityPending && <span className="island-settings-button__dot" aria-hidden="true" />}
        </button>
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
