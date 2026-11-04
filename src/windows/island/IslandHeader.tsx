import { Bell, CircleDot, Languages, Minus, RotateCcw, Settings } from "lucide-react";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { MessageSource } from "../../features/messages/messagePreview";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { useTranslation } from "../../i18n";
import { isPageEnabled, pageShortcutLabel, type IslandFeatures } from "./features";
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
  /** Modifiers shown with each page number, such as "Alt" or "Ctrl+Shift". */
  pageDigitModifiers: string;
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
  pageDigitModifiers,
}: IslandHeaderProps) {
  const t = useTranslation();
  const [{ shortcut: translationShortcut }] = useTranslationSettings();
  const messageBadgeLabel = t.messages.badge(qqNotificationCount, wechatPending);
  const withShortcut = (label: string, target: IslandPage) => {
    const shortcut = pageShortcutLabel(features, target, pageDigitModifiers);
    return shortcut ? `${label} (${shortcut})` : label;
  };
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
            title={withShortcut(`${agentStatusLabel} · ${t.agent.sessions.open}`, "agents")}
            aria-label={withShortcut(`${agentStatusLabel} · ${t.agent.sessions.open}`, "agents")}
            aria-pressed={page === "agents"}
            onClick={(event) => {
              event.stopPropagation();
              onPageChange("agents");
            }}
          >
            <CircleDot className={agentStatusIconClassName} size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : (
          <CircleDot
            className={agentStatusIconClassName}
            size={16}
            strokeWidth={2.2}
            aria-label={agentStatusLabel}
          />
        )}
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
            title={withShortcut(t.island.todoList, "todo")}
            aria-label={withShortcut(t.island.todoList, "todo")}
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
            title={withShortcut(t.island.music, "music")}
            aria-label={withShortcut(t.island.music, "music")}
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
            title={withShortcut(t.island.clipboardHistory, "clipboard")}
            aria-label={withShortcut(t.island.clipboardHistory, "clipboard")}
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
            title={withShortcut(t.island.shelf, "shelf")}
            aria-label={withShortcut(t.island.shelf, "shelf")}
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
        {isPageEnabled("qq", features) && <button className={`icon-button island-message-button${page === "qq" ? " island-message-button--active" : ""}`} type="button" aria-label={withShortcut(t.messages.label(messageBadgeLabel), "qq")} aria-pressed={page === "qq"} title={withShortcut(t.messages.title, "qq")} onClick={() => onOpenMessages(wechatPending ? "wechat" : "qq")}>
          <Bell size={17} strokeWidth={1.8} />
          {(qqNotificationCount > 0 || wechatPending) && <span className="island-message-button__dot" aria-hidden="true" />}
        </button>}
        {onOpenTranslator && (
          <button
            className={`icon-button island-translate-button${page === "translation" ? " island-translate-button--active" : ""}`}
            type="button"
            title={features.translation ? withShortcut(t.translator.title, "translation") : `${t.translator.title} (${translationShortcut})`}
            aria-label={features.translation ? withShortcut(t.translator.title, "translation") : t.translator.title}
            aria-pressed={features.translation ? page === "translation" : undefined}
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
