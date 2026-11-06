import type { ReactNode } from "react";
import { Bot, CircleArrowUp, Inbox } from "lucide-react";
import { AgentProviderIcon } from "../../features/agent-status/AgentProviderIcon";
import type { AgentSession } from "../../features/agent-status/session";
import type { AgentVisualState } from "../../features/agent-status/status";
import type { MediaState } from "../../features/media/api";
import { CollapsedMessageContent } from "../../features/messages/CollapsedMessageContent";
import { MessageSourceIcon } from "../../features/messages/MessageSourceIcon";
// After CollapsedMessageContent, matching the original stylesheet order.
import { MusicWaveButton } from "../../features/media/MusicWaveButton";
import type { DeviceUse } from "../../features/device-use/api";
import { DeviceUseIndicator } from "../../features/device-use/DeviceUseIndicator";
import type { LevelChange } from "../../features/system-levels/api";
import { LevelPopup } from "../../features/system-levels/LevelPopup";
import { messagePreviewText, type MessagePreview, type MessageSource } from "../../features/messages/messagePreview";
import type { MailController } from "../../features/messages/mail/MailPanel";
import type { QQNotificationsController } from "../../features/messages/qq-notifications/QQNotifications";
import type { WeChatRemindersController } from "../../features/messages/wechat/WeChatReminders";
import { PluginNotificationActions } from "../../features/plugins/PluginNotificationActions";
import type { PluginNotificationsController } from "../../features/plugins/usePluginNotifications";
import { useUpdateReminder } from "../../features/updater/useBackgroundUpdateCheck";
import { useTranslation } from "../../i18n";
import { openSettingsWindow } from "../settings/api";
import type { CollapsedSlots, IslandPage } from "./types";
import { useWindowDragGesture } from "./useWindowDragGesture";
import "./IslandCollapsedBar.css";

type IslandCollapsedBarProps = {
  qqMail: MailController;
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
  /** Apps using the camera and microphone; their icons show while any do. */
  deviceUse: DeviceUse;
  /** A volume or brightness change just made; it takes the place of the text while shown. */
  levelPopup: LevelChange | null;
  agentVisualState: AgentVisualState;
  onOpenPage: (page: IslandPage) => void;
  onOpenMessages: (source: MessageSource) => void;
  /** Quick translation line; it takes the place of the agent or todo text while shown. */
  translationPeek: string | null;
  onOpenTranslationPeek: () => void;
  onWindowDragStart: () => void;
  onTuck: () => void;
  /** A plugin's status text; it waits while a message preview or a translation line shows. */
  pluginStatusChip?: ReactNode;
  /** Built-in plugins' centre, gauge and session-count slots. */
  slots?: CollapsedSlots;
};

const NO_SLOTS: CollapsedSlots = {};

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
  deviceUse,
  levelPopup,
  agentVisualState,
  onOpenPage,
  onOpenMessages,
  translationPeek,
  onOpenTranslationPeek,
  onWindowDragStart,
  onTuck,
  pluginStatusChip,
  slots = NO_SLOTS,
}: IslandCollapsedBarProps) {
  const t = useTranslation();
  // A newer version found by the background check, unless the user skipped it.
  const updateVersion = useUpdateReminder();
  const { didDragRef, prepareWindowDrag, handleWindowDragMove, cancelWindowDrag } =
    useWindowDragGesture(isTucked, onWindowDragStart);
  const isMusicPlaying = mediaState.playbackStatus === "playing";
  const pulseClassName = [
    "island__pulse",
    `island__pulse--agent-${agentVisualState}`,
  ].join(" ");
  // While the island names a running agent, opening it shows the Agent page.
  const openTarget: IslandPage = agentSession ? "agents" : page;
  // The centre slot takes the summary's place while the bar has no summary.
  const showCenter = Boolean(slots.center) && !preview && !translationPeek
    && !(showCollapsedText && (showTitle || agentSession !== null || collapsedTaskTitle !== null || collapsedTodoCount !== null));

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
        className={`island__open-button${showCenter ? " island__open-button--center" : ""}`}
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
                void qqMail.readMail(qqMail.preview, qqMail.previewAccount);
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
        <span className={pulseClassName} />
        <CollapsedMessageContent preview={preview} enabled={!isExpanded && !isTucked}>
          {levelPopup ? (
            <LevelPopup change={levelPopup} />
          ) : translationPeek ? (
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
                <Bot className="island__agent-session-bot" size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
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
        {showCenter && <span className="island__center-slot">{slots.center}</span>}
      </button>
      {preview?.source === "plugin" && pluginNotifications.notification && (
        <PluginNotificationActions actions={pluginNotifications.notification.actions} onAction={pluginNotifications.runAction} />
      )}
      {qqMail.preview !== null && (
        <button className="island-message-button island-message-button--compact qq-mail-badge" type="button" aria-label={t.messages.newMailLabel} onClick={() => onOpenMessages("qqMail")}>
          <MessageSourceIcon source="qqMail" size={16} />
          <span className="island-message-button__dot" aria-hidden="true" />
        </button>
      )}
      {updateVersion && (
        <button
          className="island-message-button island-message-button--compact island-update-badge"
          type="button"
          aria-label={t.settings.project.update.islandReminder(updateVersion)}
          onClick={(event) => {
            event.stopPropagation();
            openSettingsWindow("updates");
          }}
        >
          <CircleArrowUp size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <span className="island-message-button__dot island-update-badge__dot" aria-hidden="true" />
        </button>
      )}
      {showCollapsedText && !preview && !translationPeek && !levelPopup && pluginStatusChip}
      <DeviceUseIndicator deviceUse={deviceUse} />
      {shelfCount !== null && shelfCount > 0 && (
        <button className="island-shelf-count" type="button" aria-label={t.island.shelfCount(shelfCount)} onClick={() => onOpenPage("shelf")}>
          <Inbox size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
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
      {slots.gauges && <div className="island__gauge-slot">{slots.gauges}</div>}
      {agentSessionCount === null ? (
        <button
          className="island__quiet-button"
          type="button"
          aria-label={t.island.collapseIsland}
          onClick={(event) => {
            event.stopPropagation();
            onTuck();
          }}
        />
      ) : slots.agentCount ? (
        slots.agentCount
      ) : agentSessionCount > 0 ? (
        <button
          className="island-agent-count"
          type="button"
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
