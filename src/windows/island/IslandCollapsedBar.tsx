import type { ReactNode } from "react";
import { Bot, Inbox } from "lucide-react";
import { AgentProviderIcon } from "../../features/agent-status/AgentProviderIcon";
import type { AgentSession } from "../../features/agent-status/session";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { MediaState } from "../../features/media/api";
import { CollapsedMessageContent } from "../../features/messages/CollapsedMessageContent";
import { MessageSourceIcon } from "../../features/messages/MessageSourceIcon";
// After CollapsedMessageContent, matching the original stylesheet order.
import { MusicWaveButton } from "../../features/media/MusicWaveButton";
import { messagePreviewText, type MessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import type { QQMailController } from "../../features/messages/qq-mail/QQMail";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { PluginNotificationActions } from "../../features/plugins/PluginNotificationActions";
import type { PluginNotificationsController } from "../../features/plugins/usePluginNotifications";
import { useTranslation } from "../../i18n";
import type { IslandPage } from "./types";
import { useWindowDragGesture } from "./useWindowDragGesture";
import "./IslandCollapsedBar.css";

type IslandCollapsedBarProps = {
  qqMail: QQMailController;
  qqNotifications: QQNotificationsController;
  wechatReminders: WeChatRemindersController;
  pluginNotifications: PluginNotificationsController;
  preview: MessagePreview | null;
  page: IslandPage;
  isExpanded: boolean;
  isTucked: boolean;
  showTitle: boolean;
  showCollapsedText: boolean;
  collapsedLabel: string;
  collapsedTaskTitle: string | null;
  collapsedTodoCount: number | null;
  agentSession: AgentSession | null;
  /**
   * Agent sessions still working, shown where the tuck dot was; null while the AI Agent switch
   * is off, which keeps the tuck dot.
   */
  agentSessionCount: number | null;
  mediaState: MediaState;
  /** False while music is switched off, which hides the waveform button. */
  showMusic: boolean;
  /** Files on the shelf, or null when the count is not shown. */
  shelfCount: number | null;
  agentVisualState: AgentVisualState;
  agentStatusLabel: string;
  onOpenPage: (page: IslandPage) => void;
  onOpenMessages: (source: MessageSource) => void;
  /** Quick translation line; it takes the place of the agent or todo text while shown. */
  translationPeek: string | null;
  onOpenTranslationPeek: () => void;
  onWindowDragStart: () => void;
  onTuck: () => void;
  /** A plugin's status text; it waits while a message preview or a translation line shows. */
  pluginStatusChip?: ReactNode;
};

/** The collapsed island: agent pulse, todo or message summary, mail badge, music button and tuck handle. */
export function IslandCollapsedBar({
  qqMail,
  qqNotifications,
  wechatReminders,
  pluginNotifications,
  preview,
  page,
  isExpanded,
  isTucked,
  showTitle,
  showCollapsedText,
  collapsedLabel,
  collapsedTaskTitle,
  collapsedTodoCount,
  agentSession,
  agentSessionCount,
  mediaState,
  showMusic,
  shelfCount,
  agentVisualState,
  agentStatusLabel,
  onOpenPage,
  onOpenMessages,
  translationPeek,
  onOpenTranslationPeek,
  onWindowDragStart,
  onTuck,
  pluginStatusChip,
}: IslandCollapsedBarProps) {
  const t = useTranslation();
  const { didDragRef, prepareWindowDrag, handleWindowDragMove, cancelWindowDrag } =
    useWindowDragGesture(isTucked, onWindowDragStart);
  const isMusicPlaying = mediaState.playbackStatus === "playing";
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  // While the island names a running agent, opening it shows the Agent page.
  const openTarget: IslandPage = agentSession ? "agents" : page;

  return (
    <div
      className="island__collapsed"
      aria-hidden={isExpanded}
      inert={isExpanded}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          if (translationPeek && !preview) onOpenTranslationPeek();
          else onOpenPage(openTarget);
        }
      }}
    >
      <button
        className="island__open-button"
        type="button"
        aria-label={preview
          ? t.messages.openPreview(messagePreviewText(preview, t.messages), t.messages.sourceLabels[preview.source])
          : translationPeek ? t.translator.peekLabel(translationPeek) : t.messages.expand(collapsedLabel)}
        aria-expanded={preview || translationPeek ? undefined : isExpanded}
        aria-controls={preview || translationPeek ? undefined : "island-panel"}
        onPointerDown={prepareWindowDrag}
        onPointerMove={handleWindowDragMove}
        onPointerUp={cancelWindowDrag}
        onPointerCancel={cancelWindowDrag}
        onClick={(event) => {
          if (event.detail === 0 || !didDragRef.current) {
            if (preview) {
              const source = preview.source;
              if (source === "plugin") {
                pluginNotifications.dismiss();
                return;
              }
              if (source === "qqMail" && qqMail.preview) {
                onOpenMessages("qqMail");
                void qqMail.readMail(qqMail.preview);
                return;
              }
              const open = source === "qq" ? qqNotifications.openQQ : wechatReminders.openWeChat;
              void open().then((opened) => {
                if (opened === false) onOpenMessages(source);
              });
            } else if (translationPeek) {
              onOpenTranslationPeek();
            } else {
              onOpenPage(openTarget);
            }
          }
        }}
      >
        <span className={pulseClassName} title={agentStatusLabel} />
        <CollapsedMessageContent preview={preview} enabled={!isExpanded && !isTucked}>
          {translationPeek ? (
            <span className="island__active-task" key={translationPeek}>{translationPeek}</span>
          ) : <>
          {showCollapsedText && showTitle && (
            <span className="island__brand">fly-island</span>
          )}
          {showCollapsedText && agentSession && (
            <span className="island__agent-session" key={`${agentSession.label}:${agentSession.title}`}>
              {showTitle && <span className="island__agent-session-separator">·</span>}
              {agentSession.provider ? (
                <AgentProviderIcon provider={agentSession.provider} size={16} />
              ) : (
                <Bot className="island__agent-session-bot" size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
              <span className="island__agent-session-title">{agentSession.title}</span>
            </span>
          )}
          {showCollapsedText && !agentSession && collapsedTaskTitle && (
            <span className="island__active-task" key={collapsedTaskTitle}>
              {showTitle ? "· " : ""}
              {collapsedTaskTitle}
            </span>
          )}
          {showCollapsedText && !agentSession && !collapsedTaskTitle && collapsedTodoCount !== null && (
            <span className="island__todo-count">
              {showTitle ? "· " : ""}
              {t.island.pendingTodos(collapsedTodoCount)}
            </span>
          )}
          </>}
        </CollapsedMessageContent>
      </button>
      {preview?.source === "plugin" && pluginNotifications.notification && (
        <PluginNotificationActions actions={pluginNotifications.notification.actions} onAction={pluginNotifications.runAction} />
      )}
      {qqMail.preview !== null && (
        <button className="island-message-button island-message-button--compact qq-mail-badge" type="button" aria-label={t.messages.newMailLabel} title={t.messages.openNewMail} onClick={() => onOpenMessages("qqMail")}>
          <MessageSourceIcon source="qqMail" size={16} />
          <span className="island-message-button__dot" aria-hidden="true" />
        </button>
      )}
      {showCollapsedText && !preview && !translationPeek && pluginStatusChip}
      {shelfCount !== null && shelfCount > 0 && (
        <button className="island-shelf-count" type="button" aria-label={t.island.shelfCount(shelfCount)} title={t.island.shelfCount(shelfCount)} onClick={() => onOpenPage("shelf")}>
          <Inbox size={13} strokeWidth={2.3} aria-hidden="true" />
          <span>{shelfCount}</span>
        </button>
      )}
      {showMusic && (
        <MusicWaveButton
          isAvailable={mediaState.available || mediaState.audioActive}
          isPlaying={isMusicPlaying}
          audioPeak={mediaState.audioPeak}
          label={t.island.openMusic}
          onClick={() => onOpenPage("music")}
        />
      )}
      {agentSessionCount === null ? (
        <button
          className="island__quiet-button"
          type="button"
          title={t.island.collapse}
          aria-label={t.island.collapseIsland}
          onClick={(event) => {
            event.stopPropagation();
            onTuck();
          }}
        />
      ) : agentSessionCount > 0 ? (
        <button
          className="island-agent-count"
          type="button"
          title={t.agent.sessions.activeCount(agentSessionCount)}
          aria-label={t.agent.sessions.activeCount(agentSessionCount)}
          onClick={(event) => {
            event.stopPropagation();
            onOpenPage("agents");
          }}
        >
          {agentSessionCount}
        </button>
      ) : null}
    </div>
  );
}
