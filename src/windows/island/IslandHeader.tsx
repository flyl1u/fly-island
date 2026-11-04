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
};

/** Header of the expanded island: agent status, page dots, collapse target and window actions. */
export function IslandHeader({
  page,
  features,
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
}: IslandHeaderProps) {
  const t = useTranslation();
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending);
  const agentStatusIconClassName = [
    "island__agent-status-icon",
    `island__agent-status-icon--${agentVisualState}`,
  ].join(" ");

  return (
    <header className="island__header">
      <div className="island__title">
        <CircleDot
          className={agentStatusIconClassName}
          size={16}
          strokeWidth={2.2}
          aria-label={agentStatusLabel}
        />
        {showTitle && <span>fly-island</span>}
      </div>

      <div
        className="editor-dots"
        aria-label={t.island.editor}
      >
        {features.todo && (
          <button
            className={`dot-button dot-button--todo ${
              page === "todo" ? "dot-button--active" : ""
            }`}
            type="button"
            title={t.island.todoList}
            aria-label={t.island.todoList}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("todo");
            }}
          />
        )}
        {features.music && (
          <button
            className={`dot-button dot-button--music ${
              page === "music" ? "dot-button--active" : ""
            }`}
            type="button"
            title={t.island.music}
            aria-label={t.island.music}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("music");
            }}
          />
        )}
        {features.clipboard && (
          <button
            className={`dot-button dot-button--clipboard ${
              page === "clipboard" ? "dot-button--active" : ""
            }`}
            type="button"
            title={t.island.clipboardHistory}
            aria-label={t.island.clipboardHistory}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("clipboard");
            }}
          />
        )}
        {features.shelf && (
          <button
            className={`dot-button dot-button--shelf ${
              page === "shelf" ? "dot-button--active" : ""
            }`}
            type="button"
            title={t.island.shelf}
            aria-label={t.island.shelf}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("shelf");
            }}
          />
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
        <button
          className="icon-button"
          type="button"
          title={t.settings.title}
          aria-label={t.settings.title}
          onClick={(event) => {
            event.stopPropagation();
            onOpenSettings();
          }}
        >
          <Settings size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {isPageEnabled("qq", features) && <button className={`icon-button island-message-button${page === "qq" ? " island-message-button--active" : ""}`} type="button" aria-label={t.messages.label(messageBadgeLabel)} aria-pressed={page === "qq"} title={t.messages.title} onClick={() => onOpenMessages(wechatPending ? "wechat" : "qq")}>
          <Bell size={17} strokeWidth={1.8} />
          {(qqNotificationCount > 0 || wechatPending) && <span className="island-message-button__dot" aria-hidden="true" />}
        </button>}
        {onOpenTranslator && (
          <button
            className="icon-button island-translate-button"
            type="button"
            title={`${t.translator.title} (Ctrl+Shift+F)`}
            aria-label={t.translator.title}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTranslator();
            }}
          >
            <Languages size={18} strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
        <button
          className={`icon-button island-reset-button${
            isDetached ? " island-reset-button--available" : ""
          }`}
          type="button"
          title={t.island.resetPositionLabel}
          aria-label={t.island.resetPositionLabel}
          onClick={(event) => {
            event.stopPropagation();
            onResetPosition();
          }}
        >
          <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={minimizesToTray ? t.island.minimizeToTray : t.island.tuckToTop}
          aria-label={minimizesToTray ? t.island.minimizeToTray : t.island.tuckToTop}
          onClick={(event) => {
            event.stopPropagation();
            onMinimize();
          }}
        >
          <Minus size={18} strokeWidth={2.2} />
        </button>
      </div>
    </header>
  );
}
